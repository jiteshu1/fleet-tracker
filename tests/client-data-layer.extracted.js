  function deepCopy(x){ return x===undefined ? x : JSON.parse(JSON.stringify(x)); }

  function guardedSave(key, doSave){
    return async function(){
      if(state.loadFailedKeys[key]){
        var err = new Error("Save blocked: '"+key+"' failed to load this session.");
        err.noRetry = true;
        err.handled = true;
        state.toast = "Couldn't save — \""+key+"\" is paused because its data didn't load correctly this session (to avoid overwriting real records with an incomplete copy). Please reload the page, then try again.";
        render();
        throw err;
      }
      await doSave();
    };
  }

  // ---------------------------------------------------------------------
  // MONTH-PARTITIONED DATA LAYER (trips / expenses / rtgs_entries / branch_expenses)
  // ---------------------------------------------------------------------
  // These four datasets are now stored server-side as one small chunk per
  // calendar month instead of one giant blob. Everything below exists so
  // the rest of the app can keep reading/writing state.trips, state.expenses,
  // state.rtgsEntries, state.branchExpenses exactly as before (same shape,
  // same fields — no UI/UX change) while only ever loading the months
  // actually needed:
  //   - boot loads just the CURRENT month, so login/first paint stays fast
  //     no matter how much history piles up
  //   - a background prefetch then quietly fills in the rest of the current
  //     fiscal year (April -> current month) so dashboards have it by the
  //     time they're opened, without blocking the initial render
  //   - ensureMonthsLoaded() fetches any further months on demand — meant
  //     to be hooked into date-range filters / search / export so picking
  //     an older range transparently pulls in what it needs
  // If the backend has a dataset flipped back to "single" (legacy) mode,
  // none of this needs to know — the server just returns the whole dataset
  // for a "current month" request in that case, so state.trips ends up
  // with everything either way, and per-month save() calls still work
  // correctly against a single blob too (scopedMerge is id-based, so a
  // partial month-slice as baseline/incoming is exactly as safe as sending
  // a whole-dataset slice — it just costs a few extra small round trips).
  var PARTITIONED_DATE_FIELD = {trips:'date', rtgs_entries:'date', branch_expenses:'date'};
  var PARTITIONED_KEYS = ['trips','expenses','rtgs_entries','branch_expenses'];
  var PARTITIONED_FIELD = {trips:'trips', expenses:'expenses', rtgs_entries:'rtgsEntries', branch_expenses:'branchExpenses'};

  function monthKeyFromDateStr(dateStr){
    if(typeof dateStr !== "string") return "unknown";
    var m = /^(\d{4}-\d{2})-\d{2}/.exec(dateStr.trim());
    return m ? m[1] : "unknown";
  }
  function currentMonthKey(){
    var d = new Date();
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  }
  // April -> the given month (defaults to the current month): the
  // fiscal-year-to-date list of month keys for an Apr-Mar fiscal year.
  function fiscalYearMonthsUpTo(monthKey){
    monthKey = monthKey || currentMonthKey();
    var parts = monthKey.split("-"), y = parseInt(parts[0],10), m = parseInt(parts[1],10);
    var fyStartYear = (m>=4) ? y : y-1;
    var months = [], cy = fyStartYear, cm = 4, guard = 0;
    while((cy<y || (cy===y && cm<=m)) && guard<24){
      months.push(cy+"-"+String(cm).padStart(2,"0"));
      cm++; if(cm>12){ cm=1; cy++; } guard++;
    }
    return months;
  }
  // Every calendar month touched by [dateFromStr, dateToStr] (inclusive) —
  // for hooking an explicit user-picked date range up to ensureMonthsLoaded().
  function monthsBetween(dateFromStr, dateToStr){
    if(!dateFromStr || !dateToStr) return [];
    var from = dateFromStr.slice(0,7), to = dateToStr.slice(0,7);
    if(!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return [];
    var months = [], y=parseInt(from.slice(0,4),10), m=parseInt(from.slice(5,7),10);
    var ey=parseInt(to.slice(0,4),10), em=parseInt(to.slice(5,7),10), guard=0;
    while((y<ey || (y===ey && m<=em)) && guard<600){
      months.push(y+"-"+String(m).padStart(2,"0"));
      m++; if(m>12){ m=1; y++; } guard++;
    }
    return months;
  }
  function bucketByMonth(list, dateField){
    var buckets = {};
    (list||[]).forEach(function(r){
      if(!r) return;
      var mk = monthKeyFromDateStr(r[dateField]);
      (buckets[mk] = buckets[mk] || []).push(r);
    });
    return buckets;
  }

  async function dbGetMonths(key, months){
    if(!months.length) return {};
    var res = await fetch("/api/data?key="+encodeURIComponent(key)+"&months="+encodeURIComponent(months.join(",")), {
      headers: authToken ? { "Authorization": "Bearer "+authToken } : {}
    });
    if(!res.ok){
      var errBody = await res.json().catch(function(){ return {}; });
      throw new Error(errBody.error || ("DB read failed: "+res.status));
    }
    var data = await res.json();
    // Legacy/"single" mode on the server ignores `months` and returns the
    // whole dataset under `value` instead of `values` — nothing to merge in
    // here in that case, since boot's per-month request already got it all.
    return data.values || {};
  }

  async function dbSetMonth(key, month, value, baseline){
    var payload = {key:key, month:month, value:value};
    if(baseline !== undefined) payload.baseline = baseline;
    var res = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization": authToken ? "Bearer "+authToken : "" },
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      var errBody = await res.json().catch(function(){ return {}; });
      var err = new Error(errBody.error || ("DB write failed: "+res.status));
      err.status = res.status;
      if(res.status>=400 && res.status<500) err.noRetry = true;
      throw err;
    }
    return await res.json().catch(function(){ return null; });
  }

  // Fetches whichever of `months` aren't already loaded for `key`, merges
  // their records into state[field]/state._baseline, and marks them
  // loaded. Safe to call repeatedly — already-loaded months are a no-op.
  // Returns true if it actually fetched anything (so the caller knows
  // whether a re-render is worthwhile).
  async function ensureMonthsLoaded(key, months){
    var field = PARTITIONED_FIELD[key];
    var need = (months||[]).filter(function(m){ return !state._loadedMonths[key][m]; });
    if(!need.length) return false;
    var values;
    try{ values = await dbGetMonths(key, need); }
    catch(e){ console.error("ensureMonthsLoaded failed for '"+key+"':", e); return false; }

    if(key === 'expenses'){
      var types = ['fuel','service','adblue','salary','challan'];
      state._baseline.expenses = state._baseline.expenses || {fuel:[],service:[],adblue:[],salary:[],challan:[]};
      need.forEach(function(m){
        var raw = values[m];
        var parsed = raw ? JSON.parse(raw) : {fuel:[],service:[],adblue:[],salary:[],challan:[]};
        types.forEach(function(t){
          state.expenses[t] = (state.expenses[t]||[]).concat(parsed[t]||[]);
          state._baseline.expenses[t] = (state._baseline.expenses[t]||[]).concat(deepCopy(parsed[t]||[]));
        });
        state._loadedMonths.expenses[m] = true;
      });
    } else {
      need.forEach(function(m){
        var raw = values[m];
        var parsed = raw ? JSON.parse(raw) : [];
        state[field] = (state[field]||[]).concat(parsed);
        state._baseline[key] = (state._baseline[key]||[]).concat(deepCopy(parsed));
        state._loadedMonths[key][m] = true;
      });
    }
    return true;
  }

  async function loadCriticalMonth(key, month, emptyVal){
    var field = PARTITIONED_FIELD[key];
    try{
      var res = await fetch("/api/data?key="+encodeURIComponent(key)+"&month="+encodeURIComponent(month), {
        headers: authToken ? { "Authorization": "Bearer "+authToken } : {}
      });
      if(!res.ok){ var eb = await res.json().catch(function(){ return {}; }); throw new Error(eb.error || ("DB read failed: "+res.status)); }
      var data = await res.json();
      var parsed = data.value ? JSON.parse(data.value) : emptyVal;
      state[field] = parsed;
      state._baseline[key] = deepCopy(parsed);
      state._loadedMonths[key][month] = true;
    }catch(e){
      console.error("Load failed for '"+key+"' (month "+month+"):", e);
      state.loadFailedKeys[key] = true;
      state[field] = emptyVal; // used only to render *something*; save-blocking is what protects the data
    }
  }

  // Builds a save*() function for a month-partitioned, array-shaped
  // dataset (trips, rtgs_entries, branch_expenses). Unlike the flat
  // makeSave() below, one logical save can touch more than one month's
  // chunk at once — most commonly because a record's date was edited into
  // a different month. Each touched month is saved as its own request;
  // months that grew (or stayed the same size) are saved before months
  // that shrank, so a mid-way failure leaves a harmless duplicate rather
  // than a record that briefly vanishes from both places.
  function makeMonthlySave(key, dateField){
    var field = PARTITIONED_FIELD[key];
    return function(){
      return guardedSave(key, async function(){
        var incomingByMonth = bucketByMonth(state[field], dateField);
        var baselineByMonth = bucketByMonth(state._baseline[key], dateField);
        var months = {};
        Object.keys(incomingByMonth).forEach(function(m){ months[m]=true; });
        Object.keys(baselineByMonth).forEach(function(m){ months[m]=true; });
        var monthList = Object.keys(months).sort(function(a,b){
          var da = (incomingByMonth[a]||[]).length - (baselineByMonth[a]||[]).length;
          var db = (incomingByMonth[b]||[]).length - (baselineByMonth[b]||[]).length;
          return db - da; // growing/unchanged months first, shrinking months last
        });

        var newFlatState = state[field].filter(function(r){ return !months[monthKeyFromDateStr(r[dateField])]; });
        var newFlatBaseline = (state._baseline[key]||[]).filter(function(r){ return !months[monthKeyFromDateStr(r[dateField])]; });

        for(var i=0;i<monthList.length;i++){
          var m = monthList[i];
          var incoming = incomingByMonth[m] || [];
          var baseline = baselineByMonth[m] || [];
          var resp = await dbSetMonth(key, m, JSON.stringify(incoming), JSON.stringify(baseline));
          var merged = (resp && typeof resp.value === "string") ? JSON.parse(resp.value) : incoming;
          newFlatState = newFlatState.concat(merged);
          newFlatBaseline = newFlatBaseline.concat(deepCopy(merged));
          state._loadedMonths[key][m] = true;
        }
        state[field] = newFlatState;
        state._baseline[key] = newFlatBaseline;
      })();
    };
  }

  // Same idea, but for `expenses`, whose per-month chunk is
  // {fuel:[],service:[],adblue:[],salary:[],challan:[]} rather than a
  // plain array.
  function makeMonthlyExpensesSave(){
    var types = ['fuel','service','adblue','salary','challan'];
    return function(){
      return guardedSave('expenses', async function(){
        var incomingByMonth = {}, baselineByMonth = {}, months = {};
        types.forEach(function(t){
          var inc = bucketByMonth(state.expenses[t], 'date');
          var base = bucketByMonth((state._baseline.expenses||{})[t], 'date');
          Object.keys(inc).forEach(function(m){ (incomingByMonth[m]=incomingByMonth[m]||{})[t]=inc[m]; months[m]=true; });
          Object.keys(base).forEach(function(m){ (baselineByMonth[m]=baselineByMonth[m]||{})[t]=base[m]; months[m]=true; });
        });
        function chunkCount(bucket, m){
          var o = bucket[m]||{};
          return types.reduce(function(s,t){ return s+((o[t]||[]).length); }, 0);
        }
        var monthList = Object.keys(months).sort(function(a,b){
          var da = chunkCount(incomingByMonth,a) - chunkCount(baselineByMonth,a);
          var db = chunkCount(incomingByMonth,b) - chunkCount(baselineByMonth,b);
          return db - da;
        });

        var newState = {}, newBaseline = {};
        types.forEach(function(t){
          newState[t] = (state.expenses[t]||[]).filter(function(r){ return !months[monthKeyFromDateStr(r.date)]; });
          newBaseline[t] = ((state._baseline.expenses||{})[t]||[]).filter(function(r){ return !months[monthKeyFromDateStr(r.date)]; });
        });

        for(var i=0;i<monthList.length;i++){
          var m = monthList[i];
          var incomingChunk = {}; types.forEach(function(t){ incomingChunk[t] = (incomingByMonth[m]||{})[t] || []; });
          var baselineChunk = {}; types.forEach(function(t){ baselineChunk[t] = (baselineByMonth[m]||{})[t] || []; });
          var resp = await dbSetMonth('expenses', m, JSON.stringify(incomingChunk), JSON.stringify(baselineChunk));
          var merged = (resp && typeof resp.value === "string") ? JSON.parse(resp.value) : incomingChunk;
          types.forEach(function(t){
            newState[t] = newState[t].concat(merged[t]||[]);
            newBaseline[t] = newBaseline[t].concat(deepCopy(merged[t]||[]));
          });
          state._loadedMonths.expenses[m] = true;
        }
        state.expenses = newState;
        state._baseline.expenses = newBaseline;
      })();
    };
  }

  // Fires once right after boot (current month only, so login/first paint
  // stays fast), then quietly fills in the rest of the current fiscal year
  // in the background for dashboards. Deliberately not awaited by loadAll().
  async function prefetchFiscalYearInBackground(){
    var fy = fiscalYearMonthsUpTo();
    var any = false;
    for(var i=0;i<PARTITIONED_KEYS.length;i++){
      var key = PARTITIONED_KEYS[i];
      if(state.loadFailedKeys[key]) continue; // don't compound an already-broken load
      try{
        var got = await ensureMonthsLoaded(key, fy);
        if(got) any = true;
      }catch(e){ console.error("Fiscal-year prefetch failed for '"+key+"':", e); }
    }
    if(any) render();
  }

  // ---- Reaching data outside the current fiscal year ----
  // For screens with an existing date-range picker (Own Fleet Dashboard,
  // Business Dashboard, Branch Dashboard, Branch Dispatch expenses), picking
  // an older range should just work — this quietly loads whatever months
  // that range touches, for whichever dataset(s) that screen depends on,
  // then re-renders once the data's actually in. `keys` may be a single
  // dataset key or an array of them.
  function maybeLoadRangeMonths(keys, dateFrom, dateTo){
    var months = monthsBetween(dateFrom, dateTo);
    if(!months.length) return;
    var list = Array.isArray(keys) ? keys : [keys];
    list.forEach(function(k){ state._rangeLoading[k] = true; });
    render();
    return Promise.all(list.map(function(k){ return ensureMonthsLoaded(k, months); }))
      .then(function(results){ list.forEach(function(k){ state._rangeLoading[k] = false; }); render(); return results.some(Boolean); })
      .catch(function(e){ console.error("maybeLoadRangeMonths failed:", e); list.forEach(function(k){ state._rangeLoading[k] = false; }); render(); });
  }
  // A small warning banner for any screen whose export could otherwise fire
  // mid-load and silently produce an incomplete file for the picked range.
  function rangeLoadingBanner(keys){
    var list = Array.isArray(keys) ? keys : [keys];
    return list.some(function(k){ return state._rangeLoading[k]; })
      ? '<div class="banner">Loading additional months for the selected date range — export is paused until this finishes…</div>'
      : '';
  }

  // For screens that only have a text search box (Fleet Dispatch, Branch
  // Dispatch RTGS, Expenses) — no date range there to piggyback on, so a
  // small explicit "load older data" control does the same job.
  var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function monthLabel(m){
    if(m==='unknown') return 'No date recorded';
    var parts = m.split('-');
    return MONTH_NAMES[parseInt(parts[1],10)-1]+' '+parts[0];
  }
  async function discoverMonthsFor(key){
    try{
      var res = await fetch("/api/data?key="+encodeURIComponent(key)+"&discoverMonths=1", {
        headers: authToken ? { "Authorization": "Bearer "+authToken } : {}
      });
      if(!res.ok) return [];
      var data = await res.json();
      return data.months || [];
    }catch(e){ console.error("discoverMonthsFor failed for '"+key+"':", e); return []; }
  }
  function renderLoadOlderControl(key){
    if(!state._olderMonthsOpen[key]){
      return '<div style="margin:0 0 10px;">'+
        '<span class="link" data-act="toggle-older-months" data-key="'+key+'" style="cursor:pointer;color:var(--accent,#00b8d9);font-size:12.5px;">'+icon('download',13)+' Load older data (outside this fiscal year)</span></div>';
    }
    var discovered = (state._discoveredMonths[key]||[]).filter(function(m){ return !state._loadedMonths[key][m]; });
    var html = '<div class="ofl-filter-bar" style="margin-bottom:10px;">';
    if(discovered.length===0){
      html += '<span style="font-size:11.5px;color:#9aa7c7;">Everything on record is already loaded.</span>';
    } else {
      html += '<select id="older-months-select-'+key+'">';
      discovered.slice().reverse().forEach(function(m){ html += '<option value="'+m+'">'+monthLabel(m)+'</option>'; });
      if(discovered.length>1) html += '<option value="__all__">All of the above</option>';
      html += '</select>';
      html += '<button class="btn btn-ghost" style="width:auto;flex:0 0 auto;background:#070a14;border-color:#1c2740;color:#e3e9f7;" data-act="load-older-month" data-key="'+key+'">Load</button>';
    }
    if(state._olderMonthsNote[key]) html += '<span style="font-size:11.5px;color:#9aa7c7;">'+esc(state._olderMonthsNote[key])+'</span>';
    html += '</div>';
    return html;
  }

  // "Export a specific date range" — for the screens whose search box has
  // no date filter to piggyback on. Loads whatever months the picked range
  // touches (if not already loaded), then writes an Excel file straight
  // from the data (not from the on-screen table, which is paginated) —
  // so the export always has the complete range, not just one page of it.
  // Reuses .ofl-filter-bar — the same compact, dark toolbar style every
  // other date-range filter in the app already uses — rather than plain
  // full-width inputs, which is what made this control take up far more
  // room than it needed to.
  function renderRangeExportControl(key){
    var from = state._rangeExportFrom[key] || "";
    var to = state._rangeExportTo[key] || "";
    var html = '<div class="ofl-filter-bar" style="margin-bottom:14px;">';
    html += '<span style="font-size:11.5px;color:#9aa7c7;font-weight:600;white-space:nowrap;">'+icon('download',13)+' Export range</span>';
    html += '<input type="date" min="2015-01-01" max="2035-12-31" id="rangeexport-from-'+key+'" value="'+esc(from)+'">';
    html += '<span style="color:#5a6b8c;font-size:13px;">→</span>';
    html += '<input type="date" min="2015-01-01" max="2035-12-31" id="rangeexport-to-'+key+'" value="'+esc(to)+'">';
    html += '<button class="btn btn-ghost" style="width:auto;flex:0 0 auto;background:#070a14;border-color:#1c2740;color:#e3e9f7;" data-act="export-range-excel" data-key="'+key+'"'+(state._rangeLoading[key]?' disabled':'')+'>'+icon('download',13)+' Export</button>';
    if(state._rangeLoading[key]) html += '<span style="font-size:11.5px;color:#9aa7c7;">Loading…</span>';
    else if(state._rangeExportNote[key]) html += '<span style="font-size:11.5px;color:#9aa7c7;">'+esc(state._rangeExportNote[key])+'</span>';
    html += '</div>';
    return html;
  }

  function writeRangeExcelFile(rows, columns, filenamePrefix, dateFrom, dateTo){
    if(typeof XLSX==="undefined") return { ok:false, error:"Export tool load nahi hua, internet check karo." };
    if(!rows.length) return { ok:false, error:"No records in that date range." };
    var data = rows.map(function(r){
      var o = {};
      columns.forEach(function(c){ o[c.label] = c.get(r); });
      return o;
    });
    var ws = XLSX.utils.json_to_sheet(data);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fleet tracking");
    XLSX.writeFile(wb, filenamePrefix+"-"+dateFrom+"_to_"+dateTo+".xlsx");
    return { ok:true, count: rows.length };
  }

