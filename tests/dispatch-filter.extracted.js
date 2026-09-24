  var TRIP_COLUMNS = [
    {key:"date", label:"Date", get:function(tr){return tr.date||"";}},
    {key:"lr", label:"LR", get:function(tr){return tr.lr||"";}},
    {key:"challan", label:"Challan", get:function(tr){return tr.challan||"";}},
    {key:"truckNo", label:"Truck", get:function(tr){var t=findTruck(tr.truckId); return (t&&t.truckNo)||"";}},
    {key:"from", label:"From", get:function(tr){return tr.from||"";}},
    {key:"to", label:"To", get:function(tr){return tr.to||"";}},
    {key:"wt", label:"Wt", numeric:true, get:function(tr){return num(tr.wt);}},
    {key:"rate", label:"Rate", get:function(tr){return tr.rate||"";}},
    {key:"freight", label:"Freight", numeric:true, get:function(tr){return tripFreight(tr);}},
    {key:"driverAdv", label:"Driver Adv", numeric:true, get:function(tr){return num(tr.driverAdv);}},
    {key:"comm", label:"Comm", numeric:true, get:function(tr){return num(tr.comm);}},
    {key:"charges", label:"Charges", numeric:true, get:function(tr){return num(tr.charges);}},
    {key:"advCash", label:"Adv Cash", numeric:true, get:function(tr){return num(tr.advCash);}},
    {key:"advRec", label:"Adv Rec.", numeric:true, get:function(tr){return num(tr.advRec);}},
    {key:"advRecDate", label:"Adv Rec Date", get:function(tr){return tr.advRecDate||"";}},
    {key:"party", label:"Party", get:function(tr){return tr.party||"";}},
    {key:"tds", label:"TDS", numeric:true, get:function(tr){return num(tr.tds);}},
    {key:"bal", label:"Bal", numeric:true, get:function(tr){return tripBal(tr);}},
    {key:"balRec", label:"Bal Rec", numeric:true, get:function(tr){return num(tr.balRec);}},
    {key:"balRecDate", label:"Bal Rec Date", get:function(tr){return tr.balRecDate||"";}},
    {key:"balRemaining", label:"Bal Remaining", numeric:true, get:function(tr){return tripBalRemaining(tr);}},
    {key:"loadingKm", label:"Loading KM", numeric:true, get:function(tr){return num(tr.loadingKm);}},
    {key:"unloadingKm", label:"Unloading KM", numeric:true, get:function(tr){return num(tr.unloadingKm);}},
    {key:"totalDist", label:"Total Dist", numeric:true, get:function(tr){return tripTotalDist(tr);}},
    {key:"billNo", label:"Bill No", get:function(tr){return tr.billNo||"";}},
    {key:"billDate", label:"Bill Date", get:function(tr){return tr.billDate||"";}}
  ];
  var TRIP_FILTER_KEYS = ["lr","challan","truckNo","from","to","party","billNo"];

  function tripMatchesFilter(tr, q){
    if(!q) return true;
    q = q.toLowerCase();
    return TRIP_COLUMNS.some(function(c){
      if(TRIP_FILTER_KEYS.indexOf(c.key)===-1) return false;
      return String(c.get(tr)).toLowerCase().indexOf(q)>-1;
    });
  }

  function sortTrips(list){
    if(!state.dispatchSortKey) return list;
    var col = TRIP_COLUMNS.find(function(c){return c.key===state.dispatchSortKey;});
    if(!col) return list;
    var dir = state.dispatchSortDir;
    return list.slice().sort(function(a,b){
      var av = col.get(a), bv = col.get(b);
      if(col.numeric){ return (av-bv)*dir; }
      return String(av).localeCompare(String(bv))*dir;
    });
  }

  function renderTripTableBlock(list, opts){
    opts = opts || {};
    var shotId = opts.shotId || 'dispatch-table-shot';
    var sortable = !!opts.sortable;
    var selectable = !!opts.selectable;
    var allIds = opts.allIds || list.map(function(tr){ return tr.id; });
    var allChecked = selectable && allIds.length>0 && allIds.every(function(id){ return !!state.dispatchSelected[id]; });
    var isFullscreen = state.fullscreenTable===shotId;
    var html = "";
    if(isFullscreen){
      html += '<div class="mfl-fullscreen-bar"><span>Fleet Dispatch — full screen</span>'+
        '<button class="iconbtn" data-act="toggle-table-fullscreen" data-target="'+shotId+'">'+icon('collapse',14)+' Exit full screen</button></div>';
    }
    html += '<div class="mfl-table-wrap'+(isFullscreen?' mfl-table-fullscreen':'')+'" id="'+shotId+'"><table class="mfl-table"><thead><tr>';
    if(selectable){
      html += '<th style="padding-left:12px;"><input type="checkbox" class="mfl-select-chk" data-act="toggle-trip-select-all"'+(allChecked?' checked':'')+'></th>';
    }
    TRIP_COLUMNS.forEach(function(c){
      var arrow = state.dispatchSortKey===c.key ? (state.dispatchSortDir===1?' ▲':' ▼') : '';
      html += sortable
        ? '<th class="sortable-th" data-act="sort-trips" data-key="'+c.key+'">'+esc(c.label)+arrow+'</th>'
        : '<th>'+esc(c.label)+'</th>';
    });
    html += '<th>Edit</th></tr></thead><tbody>';
    list.forEach(function(tr){
      var truck = findTruck(tr.truckId);
      var editCell = canEditTrip(tr)
        ? '<button class="iconbtn mfl-edit-btn" data-act="edit-trip" data-id="'+tr.id+'" title="Edit this trip">'+icon('edit',14)+' Edit</button>'
        : '<span class="muted">View only</span>';
      var checkCell = selectable
        ? '<td style="padding-left:12px;"><input type="checkbox" class="mfl-select-chk" data-act="toggle-trip-select" data-id="'+tr.id+'"'+(state.dispatchSelected[tr.id]?' checked':'')+'></td>'
        : '';
      html += '<tr data-act="edit-trip" data-id="'+tr.id+'">'+
        checkCell+
        '<td>'+esc(formatDateIN(tr.date)||"—")+'</td>'+
        '<td>'+esc(tr.lr||"—")+'</td>'+
        '<td>'+esc(tr.challan||"—")+'</td>'+
        '<td><b>'+esc((truck&&truck.truckNo)||"—")+'</b></td>'+
        '<td>'+esc(tr.from||"—")+'</td>'+
        '<td>'+esc(tr.to||"—")+'</td>'+
        '<td>'+esc(tr.wt||"—")+'</td>'+
        '<td>'+esc(tr.rate||"—")+'</td>'+
        '<td>'+money(tripFreight(tr))+'</td>'+
        '<td>'+esc(tr.driverAdv||"—")+'</td>'+
        '<td>'+esc(tr.comm||"—")+'</td>'+
        '<td>'+esc(tr.charges||"—")+'</td>'+
        '<td>'+esc(tr.advCash||"—")+'</td>'+
        '<td>'+esc(tr.advRec||"—")+'</td>'+
        '<td>'+esc(formatDateIN(tr.advRecDate)||"—")+'</td>'+
        '<td>'+esc(tr.party||"—")+'</td>'+
        '<td>'+esc(tr.tds||"—")+'</td>'+
        '<td><b>'+money(tripBal(tr))+'</b></td>'+
        '<td>'+esc(tr.balRec||"—")+'</td>'+
        '<td>'+esc(formatDateIN(tr.balRecDate)||"—")+'</td>'+
        '<td>'+money(tripBalRemaining(tr))+'</td>'+
        '<td>'+esc(tr.loadingKm||"—")+'</td>'+
        '<td>'+esc(tr.unloadingKm||"—")+'</td>'+
        '<td>'+esc(tripTotalDist(tr))+'</td>'+
        '<td>'+esc(tr.billNo||"—")+'</td>'+
        '<td>'+esc(formatDateIN(tr.billDate)||"—")+'</td>'+
        '<td>'+editCell+'</td>'+
      '</tr>';
    });
    html += '</tbody></table></div>';
    if(!opts.hideExportButtons){
      html += '<div class="row" style="margin-top:10px;max-width:420px;">';
      html += '<button class="btn btn-ghost" data-act="download-table-image" data-target="'+shotId+'">'+icon('download')+' Export JPG</button>';
      html += '<button class="btn btn-ghost" data-act="export-table-excel" data-target="'+shotId+'">'+icon('download')+' Export to Excel</button>';
      html += '</div>';
    }
    return html;
  }

  function renderTripForm(){
    var editing = state.view==="editTrip";
    var tr = editing ? findTrip(state.activeTripId) : null;
    if(editing && !tr) return '<div class="empty">Trip not found.</div>';
    if(editing && !canEditTrip(tr)) return '<div class="empty">You can only view this trip — it belongs to another manager\'s fleet.</div>';
    var v = function(k){ return tr ? esc(tr[k]) : ''; };

    var html = '<div class="backlink" data-act="back">‹ Back</div>';
    html += '<div class="card" id="trip-form-card">';

    html += '<div class="field-grid">';
    html += '<div><label>Date</label><input id="tp-date" type="date" value="'+v('date')+'"></div>';
    html += '<div><label>LR</label><input id="tp-lr" placeholder="LR no. or MARKET" value="'+v('lr')+'"></div>';
    html += '</div>';
    html += '<div class="field-grid">';
    html += '<div><label>Challan</label><input id="tp-challan" value="'+v('challan')+'"></div>';
    html += '<div><label>Truck</label><select id="tp-truck">';
    html += '<option value="">— Select vehicle —</option>';
    var truckList = state.activeManagerName ? trucksForManager(state.activeManagerName) : [];
    truckList.forEach(function(t){
      var sel = tr && tr.truckId===t.id ? ' selected' : '';
      html += '<option value="'+t.id+'"'+sel+'>'+esc(t.truckNo)+'</option>';
    });
    html += '</select></div>';
    html += '</div>';

    html += '<div class="field-grid">';
    html += '<div><label>From</label><input id="tp-from" value="'+v('from')+'"></div>';
    html += '<div><label>To</label><input id="tp-to" value="'+v('to')+'"></div>';
    html += '</div>';
    html += '<label>Party</label><input id="tp-party" value="'+v('party')+'">';

    html += '<div class="mfl-form-section">Weight, rate &amp; freight</div>';
    html += '<div class="field-grid">';
    html += '<div><label>Wt</label><input id="tp-wt" type="number" step="any" value="'+v('wt')+'"></div>';
    html += '<div><label>Rate <span class="muted">(number, or "FIX")</span></label><input id="tp-rate" value="'+v('rate')+'"></div>';
    html += '</div>';
    html += '<label>Freight (₹) <span class="muted" title="Auto = Rate × Wt when Rate is a number; type it directly for FIX loads">— auto-fills, editable</span></label>';
    html += '<input id="tp-freight" value="'+v('freight')+'">';

    html += '<div class="mfl-form-section">Advances &amp; deductions</div>';
    html += '<div class="field-grid">';
    html += '<div><label>Driver Adv (₹)</label><input id="tp-driverAdv" type="number" step="any" value="'+v('driverAdv')+'"></div>';
    html += '<div><label>Comm (₹)</label><input id="tp-comm" type="number" step="any" value="'+v('comm')+'"></div>';
    html += '</div>';
    html += '<div class="field-grid">';
    html += '<div><label>Charges (₹)</label><input id="tp-charges" type="number" step="any" value="'+v('charges')+'"></div>';
    html += '<div><label>Adv Cash (₹)</label><input id="tp-advCash" type="number" step="any" value="'+v('advCash')+'"></div>';
    html += '</div>';
    html += '<div class="field-grid">';
    html += '<div><label>Adv Rec. (₹)</label><input id="tp-advRec" type="number" step="any" value="'+v('advRec')+'"></div>';
    html += '<div><label>Adv Rec Date</label><input id="tp-advRecDate" type="date" value="'+v('advRecDate')+'"></div>';
    html += '</div>';
    html += '<div class="field-grid">';
    html += '<div><label>TDS (₹)</label><input id="tp-tds" type="number" step="any" value="'+v('tds')+'"></div>';
    html += '<div><label>Balance <span class="muted" title="Freight − Comm − Charges − Adv Cash − Adv Rec. − TDS">(auto)</span></label><div class="tp-calc-box" id="tp-bal-calc">—</div></div>';
    html += '</div>';
    html += '<div class="field-grid">';
    html += '<div><label>Bal Rec (₹)</label><input id="tp-balRec" type="number" step="any" value="'+v('balRec')+'"></div>';
    html += '<div><label>Bal Remaining <span class="muted">(auto)</span></label><div class="tp-calc-box" id="tp-balremaining-calc">—</div></div>';
    html += '</div>';
    html += '<label>Bal Rec Date</label><input id="tp-balRecDate" type="date" value="'+v('balRecDate')+'">';

    html += '<div class="mfl-form-section">Distance &amp; billing</div>';
    html += '<div class="field-grid">';
    html += '<div><label>Loading KM</label><input id="tp-loadingKm" type="number" step="any" value="'+v('loadingKm')+'"></div>';
    html += '<div><label>Unloading KM</label><input id="tp-unloadingKm" type="number" step="any" value="'+v('unloadingKm')+'"></div>';
    html += '</div>';
    html += '<div class="field-grid">';
    html += '<div><label>Total Dist <span class="muted">(auto)</span></label><div class="tp-calc-box" id="tp-totaldist-calc">—</div></div>';
    html += '<div><label>Bill No</label><input id="tp-billNo" value="'+v('billNo')+'"></div>';
    html += '</div>';
    html += '<label>Bill Date</label><input id="tp-billDate" type="date" value="'+v('billDate')+'">';

    if(state.error) html += '<div class="err">'+esc(state.error)+'</div>';

    html += '<div class="row" style="margin-top:16px;">';
    html += '<button class="btn btn-primary" data-act="save-trip"'+(editing?' data-id="'+tr.id+'"':'')+'>'+(editing?'Save changes':'Add trip')+'</button>';
    html += '</div>';
    if(editing){
      html += '<button class="btn btn-danger" style="margin-top:8px;" data-act="delete-trip" data-id="'+tr.id+'">Delete trip</button>';
    }
    html += '</div>';
    return html;
  }

  // ---------- Fleet Expenses: dashboard, table, form ----------
  function renderExpenseDashboard(){
    var type = state.activeExpenseType;
    var cfg = EXPENSE_TYPES[type];
    if(!cfg) return '<div class="empty">Unknown expense type.</div>';
    var role = state.session.role;
    var visibleManagers = role==="manager"
      ? state.managers.filter(function(m){ return m.name===state.session.name; })
      : state.managers.slice();

    if(!state.expenseManagerName || state.expenseManagerName==="__all__"){
      state.expenseManagerName = (role==="manager" ? state.session.name : (visibleManagers[0] && visibleManagers[0].name)) || null;
    }
    var selKey = state.expenseManagerName;
    var html = "";

    if(visibleManagers.length===0){
      return '<div class="empty">No fleet managers set up yet. Add a manager under Fleet Tracking → Managers first.</div>';
    }

    html += '<div class="card dispatch-mgr-bar">';
    html += '<div class="dispatch-mgr-title">'+esc(cfg.label)+' for</div>';
    html += '<div class="dispatch-mgr-row">';
    visibleManagers.forEach(function(m){
      html += '<div class="dispatch-mgr-pill'+(selKey===m.name?' active':'')+'" data-act="expense-select" data-name="'+esc(m.name)+'">'+icon('manager',15)+' '+esc(m.name)+'</div>';
    });
    html += '</div></div>';

    html += '<div class="dispatch-toolbar">';
    html += '<button class="btn btn-primary" style="width:auto;max-width:200px;" data-act="add-expense">'+icon('add',16)+' Add '+esc(cfg.label.split(" ")[0])+'</button>';
    html += '<div class="row" style="width:auto;">';
    html += '<button class="btn btn-ghost" style="width:auto;" data-act="trigger-expense-import">'+icon('upload',15)+' Upload your data</button>';
    if(expensesInScope(type, selKey).length>0){
      html += '<button class="btn btn-ghost" style="width:auto;" data-act="download-table-image" data-target="expense-table-shot">'+icon('download')+' Export JPG</button>';
      html += '<button class="btn btn-ghost" style="width:auto;" data-act="export-table-excel" data-target="expense-table-shot">'+icon('download')+' Export to Excel</button>';
    }
    html += '</div>';
    html += '</div>';
    html += '<input type="file" id="expense-import-file" accept=".xlsx,.xls" style="display:none">';
    if(state.expenseImportNote) html += '<div class="banner">'+esc(state.expenseImportNote)+'</div>';

    var fullList = expensesInScope(type, selKey);
    if(fullList.length>0){
      html += '<input class="search" id="expense-search" placeholder="Filter…" value="'+esc(state.expenseFilter)+'">';
    }
    html += renderLoadOlderControl('expenses');
    if(fullList.length>0) html += renderRangeExportControl('expenses');

    var list = fullList.filter(function(exp){
      if(!state.expenseFilter) return true;
      var q = state.expenseFilter.toLowerCase();
      return cfg.fields.some(function(f){ return String(expenseFieldValue(type,exp,f)).toLowerCase().indexOf(q)>-1; })
        || (cfg.scope==="vehicle" && (function(){ var t=findTruck(exp.truckId); return t && t.truckNo.toLowerCase().indexOf(q)>-1; })())
        || (cfg.scope==="driver" && String(exp.driverName||"").toLowerCase().indexOf(q)>-1);
    });

    if(state.expenseSortKey){
      var sortField = cfg.fields.find(function(f){return f.key===state.expenseSortKey;});
      var dir = state.expenseSortDir;
      list = list.slice().sort(function(a,b){
        var av = sortField ? (sortField.auto?expenseAmount(type,a):a[sortField.key]) : (a.createdAt||0);
        var bv = sortField ? (sortField.auto?expenseAmount(type,b):b[sortField.key]) : (b.createdAt||0);
        if(sortField && (sortField.type==="number" || sortField.auto)) return (num(av)-num(bv))*dir;
        return String(av||"").localeCompare(String(bv||""))*dir;
      });
    } else {
      list = list.slice().sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); });
    }

    if(fullList.length===0){
      html += '<div class="empty">No '+esc(cfg.label.toLowerCase())+' entries yet for this manager. Click "Add '+esc(cfg.label.split(" ")[0])+'" to start.</div>';
    } else if(list.length===0){
      html += '<div class="empty">No entries match "'+esc(state.expenseFilter)+'".</div>';
    } else {
      var perPage = 50;
      var totalPages = Math.max(1, Math.ceil(list.length/perPage));
      if(state.expensePage>totalPages) state.expensePage = totalPages;
      if(state.expensePage<1) state.expensePage = 1;
      var startIdx = (state.expensePage-1)*perPage;
      var pageList = list.slice(startIdx, startIdx+perPage);
      state.expenseAllIds = list.map(function(x){ return x.id; });

      var selectedCount = Object.keys(state.expenseSelected).filter(function(id){ return state.expenseSelected[id]; }).length;
      if(selectedCount>0){
        html += '<div class="dispatch-bulkbar">'+
          '<span>'+selectedCount+' entr'+(selectedCount>1?'ies':'y')+' selected</span>'+
          '<button class="btn btn-danger" style="width:auto;" data-act="delete-selected-expenses">'+icon('trash',14)+' Delete selected</button>'+
          '<button class="btn btn-ghost" style="width:auto;" data-act="clear-expense-selection">Clear</button>'+
        '</div>';
      }

      html += renderExpenseTableBlock(type, pageList, {allIds:state.expenseAllIds});

      html += '<div class="dispatch-pagination">';
      html += '<div class="muted">Showing '+(startIdx+1)+' to '+Math.min(startIdx+perPage,list.length)+' of '+list.length+' entries</div>';
      html += '<div class="dp-pages">';
      html += '<button class="dp-page-btn" data-act="expense-page" data-page="'+(state.expensePage-1)+'"'+(state.expensePage<=1?' disabled':'')+'>«</button>';
      for(var p=1;p<=totalPages;p++){
        if(p===1 || p===totalPages || Math.abs(p-state.expensePage)<=1){
          html += '<button class="dp-page-btn'+(p===state.expensePage?' active':'')+'" data-act="expense-page" data-page="'+p+'">'+p+'</button>';
        } else if(Math.abs(p-state.expensePage)===2){
          html += '<span class="muted" style="padding:0 2px;">…</span>';
        }
      }
      html += '<button class="dp-page-btn" data-act="expense-page" data-page="'+(state.expensePage+1)+'"'+(state.expensePage>=totalPages?' disabled':'')+'>»</button>';
      html += '</div></div>';
    }
    return html;
  }

  function renderExpenseTableBlock(type, list, opts){
    opts = opts || {};
    var cfg = EXPENSE_TYPES[type];
    var shotId = 'expense-table-shot';
    var allIds = opts.allIds || list.map(function(x){return x.id;});
    var allChecked = allIds.length>0 && allIds.every(function(id){ return !!state.expenseSelected[id]; });
    var html = '<div class="mfl-table-wrap" id="'+shotId+'"><table class="mfl-table"><thead><tr>';
    html += '<th style="padding-left:12px;"><input type="checkbox" class="mfl-select-chk" data-act="toggle-expense-select-all"'+(allChecked?' checked':'')+'></th>';
    if(cfg.scope==="vehicle") html += '<th class="sortable-th" data-act="sort-expenses" data-key="truckNo">Vehicle'+(state.expenseSortKey==="truckNo"?(state.expenseSortDir===1?' ▲':' ▼'):'')+'</th>';
    else html += '<th class="sortable-th" data-act="sort-expenses" data-key="driverName">Driver'+(state.expenseSortKey==="driverName"?(state.expenseSortDir===1?' ▲':' ▼'):'')+'</th>';
    cfg.fields.forEach(function(f){
      var arrow = state.expenseSortKey===f.key ? (state.expenseSortDir===1?' ▲':' ▼') : '';
      html += '<th class="sortable-th" data-act="sort-expenses" data-key="'+f.key+'">'+esc(f.label.replace(/\s*\(₹\)/,''))+arrow+'</th>';
    });
    if(type==="fuel") html += '<th>Mileage</th>';
    html += '<th>Edit</th></tr></thead><tbody>';
    list.forEach(function(exp){
      var editCell = canEditExpense(type, exp)
        ? '<button class="iconbtn mfl-edit-btn" data-act="edit-expense" data-id="'+exp.id+'" title="Edit">'+icon('edit',14)+' Edit</button>'
        : '<span class="muted">View only</span>';
      html += '<tr data-act="edit-expense" data-id="'+exp.id+'">';
      html += '<td style="padding-left:12px;"><input type="checkbox" class="mfl-select-chk" data-act="toggle-expense-select" data-id="'+exp.id+'"'+(state.expenseSelected[exp.id]?' checked':'')+'></td>';
      if(cfg.scope==="vehicle"){
        var truck = findTruck(exp.truckId);
        html += '<td><b>'+esc((truck&&truck.truckNo)||"—")+'</b></td>';
      } else {
        html += '<td><b>'+esc(exp.driverName||"—")+'</b></td>';
      }
      cfg.fields.forEach(function(f){
        var val = expenseFieldValue(type, exp, f);
        var isDeductionAmount = type==="salary" && f.key==="amount" && exp.type==="Deduction";
        html += '<td>'+(f.auto ? '<b>₹'+val+'</b>' : (isDeductionAmount ? '<b style="color:#c0392b;">−₹'+esc(val)+'</b>' : esc(val||"—")))+'</td>';
      });
      if(type==="fuel"){
        var mi = fuelMileage(exp);
        html += '<td>'+(mi==null ? '<span class="muted">—</span>' : money(mi)+' km/L')+'</td>';
      }
      html += '<td>'+editCell+'</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderExpenseForm(){
    var type = state.activeExpenseType;
    var cfg = EXPENSE_TYPES[type];
    var editing = state.view==="editExpense";
    var exp = editing ? findExpense(type, state.activeExpenseId) : null;
    if(editing && !exp) return '<div class="empty">Entry not found.</div>';
    if(editing && !canEditExpense(type, exp)) return '<div class="empty">You can only view this entry — it belongs to another manager\'s fleet.</div>';

    var v = function(k){ return exp && exp[k]!=null ? esc(exp[k]) : ''; };
    var html = '<div class="backlink" data-act="back">‹ Back</div>';
    html += '<div class="card" id="expense-form-card">';
    html += '<div class="mfl-form-section">'+esc(cfg.label)+'</div>';

    if(cfg.scope==="vehicle"){
      var truckList = state.expenseManagerName ? trucksForManager(state.expenseManagerName) : [];
      html += '<label>Vehicle</label><select id="ep-truckId"><option value="">— Select vehicle —</option>';
      truckList.forEach(function(t){
        html += '<option value="'+t.id+'"'+(exp&&exp.truckId===t.id?' selected':'')+'>'+esc(t.truckNo)+'</option>';
      });
      html += '</select>';
    } else {
      var driverList = state.expenseManagerName ? state.drivers.filter(function(d){return d.managerName===state.expenseManagerName;}) : [];
      html += '<label>Driver</label><select id="ep-driverName"><option value="">— Select driver —</option>';
      driverList.forEach(function(d){
        html += '<option value="'+esc(d.name)+'"'+(exp&&exp.driverName===d.name?' selected':'')+'>'+esc(d.name)+'</option>';
      });
      html += '</select>';
    }

    cfg.fields.forEach(function(f){
      if(f.auto){
        html += '<label>'+esc(f.label)+' <span class="muted">(auto)</span></label><div class="tp-calc-box" id="ep-calc-amount">—</div>';
        return;
      }
      html += '<label>'+esc(f.label)+'</label>';
      if(f.type==="select"){
        html += '<select id="ep-'+f.key+'">';
        f.options.forEach(function(o){ html += '<option value="'+esc(o)+'"'+(exp&&exp[f.key]===o?' selected':'')+'>'+esc(o)+'</option>'; });
        html += '</select>';
      } else if(f.type==="date"){
        html += '<input id="ep-'+f.key+'" type="date" value="'+v(f.key)+'">';
      } else if(f.type==="month"){
        html += '<input id="ep-'+f.key+'" type="month" value="'+v(f.key)+'">';
      } else if(f.type==="number"){
        html += '<input id="ep-'+f.key+'" type="number" step="any" value="'+v(f.key)+'">';
      } else {
        html += '<input id="ep-'+f.key+'" value="'+v(f.key)+'">';
      }
    });

    if(type==="fuel" && exp){
      var mi = fuelMileage(exp);
      html += '<div class="kv"><span>Mileage vs previous fill-up</span><b>'+(mi==null?'—':money(mi)+' km/L')+'</b></div>';
    }

    if(state.error) html += '<div class="err">'+esc(state.error)+'</div>';

    html += '<div class="row" style="margin-top:16px;">';
    html += '<button class="btn btn-primary" data-act="save-expense"'+(editing?' data-id="'+exp.id+'"':'')+'>'+(editing?'Save changes':'Add entry')+'</button>';
    html += '</div>';
    if(editing){
      html += '<button class="btn btn-danger" style="margin-top:8px;" data-act="delete-expense" data-id="'+exp.id+'">Delete entry</button>';
    }
    html += '</div>';
    return html;
  }

  // ---------- Business Dashboard ----------
  // Pulls together Dispatch (trips/revenue) and Expenses (fuel, service,
  // adblue, salary, challans) into one company-wide picture. Driver salary
  // is treated as a company-level cost, not allocated to a single vehicle
  // (a driver can move between trucks) — everything else that's logged
  // against a specific truckId counts as that vehicle's running cost.
  // ---------- lightweight inline SVG chart helpers (no external chart lib) ----------
  function monthKeysBack(n){
    var out = [], now = new Date();
    for(var i=n-1;i>=0;i--){
      var dt = new Date(now.getFullYear(), now.getMonth()-i, 1);
      out.push(dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0"));
    }
    return out;
  }
  function monthLabel(mk){
    var names=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var p = mk.split("-");
    return names[parseInt(p[1],10)-1]+" "+p[0].slice(2);
  }
  // Month buckets spanning a from/to range (inclusive), capped to 12 so a
  // multi-year custom range still renders a sane chart.
  function monthKeysInRange(fromStr, toStr){
    var from = fromStr ? new Date(fromStr+"T00:00:00") : null;
    var to = toStr ? new Date(toStr+"T00:00:00") : null;
    if(!from || !to || isNaN(from) || isNaN(to) || from>to) return monthKeysBack(6);
    var out = [];
    var cur = new Date(from.getFullYear(), from.getMonth(), 1);
    var last = new Date(to.getFullYear(), to.getMonth(), 1);
    while(cur<=last && out.length<12){
      out.push(cur.getFullYear()+"-"+String(cur.getMonth()+1).padStart(2,"0"));
      cur.setMonth(cur.getMonth()+1);
    }
    return out.length ? out : monthKeysBack(6);
  }
  function svgLineChart(series, labels, opts){
    opts = opts||{};
    var w=opts.width||600, h=opts.height||170, pad=26;
    var allVals = series.reduce(function(a,s){return a.concat(s.values);},[0]);
    var maxV = Math.max.apply(null, allVals), minV = Math.min(0, Math.min.apply(null, allVals));
    var n = labels.length;
    function X(i){ return pad + i*(w-2*pad)/(Math.max(n-1,1)); }
    function Y(v){ return h-pad - (v-minV)/((maxV-minV)||1)*(h-2*pad); }
    var svg = '<svg viewBox="0 0 '+w+' '+h+'" style="width:100%;height:auto;display:block;">';
    for(var g=0; g<=3; g++){
      var gy = pad + g*(h-2*pad)/3;
      svg += '<line x1="'+pad+'" y1="'+gy+'" x2="'+(w-pad)+'" y2="'+gy+'" stroke="#1c2740" stroke-width="1"/>';
    }
    series.forEach(function(s){
      var pts = s.values.map(function(v,i){ return X(i)+","+Y(v); }).join(" ");
      svg += '<polyline points="'+pts+'" fill="none" stroke="'+s.color+'" stroke-width="2.4" style="filter:drop-shadow(0 0 3px '+s.color+');"/>';
      s.values.forEach(function(v,i){ svg += '<circle cx="'+X(i)+'" cy="'+Y(v)+'" r="2.6" fill="'+s.color+'"/>'; });
    });
    labels.forEach(function(lab,i){
      svg += '<text x="'+X(i)+'" y="'+(h-6)+'" font-size="8.5" fill="#8fa3c9" text-anchor="middle">'+esc(lab)+'</text>';
    });
    svg += '</svg>';
    return svg;
  }
  function svgDonut(segments, opts){
    opts = opts||{};
    var size=opts.size||132, stroke=opts.stroke||20;
    var r=(size-stroke)/2, cx=size/2, cy=size/2;
    var total = segments.reduce(function(s,x){return s+x.value;},0) || 1;
    var circ = 2*Math.PI*r, offset=0;
    var svg = '<svg viewBox="0 0 '+size+' '+size+'" style="width:'+size+'px;height:'+size+'px;flex-shrink:0;">';
    segments.forEach(function(seg){
      if(seg.value<=0) return;
      var dash = seg.value/total*circ;
      svg += '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+seg.color+'" stroke-width="'+stroke+'" '+
        'stroke-dasharray="'+dash+' '+(circ-dash)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 '+cx+' '+cy+')" style="filter:drop-shadow(0 0 3px '+seg.color+');"/>';
      offset += dash;
    });
    svg += '<text x="'+cx+'" y="'+(cy-3)+'" font-size="13" font-weight="800" fill="#f1f5ff" text-anchor="middle">₹'+shortMoney(total)+'</text>';
    svg += '<text x="'+cx+'" y="'+(cy+13)+'" font-size="8" fill="#8fa3c9" text-anchor="middle">Total</text>';
    svg += '</svg>';
    return svg;
  }
  function shortMoney(n){
    n = Math.abs(n);
    if(n>=10000000) return (n/10000000).toFixed(2)+'Cr';
    if(n>=100000) return (n/100000).toFixed(2)+'L';
    if(n>=1000) return (n/1000).toFixed(1)+'k';
    return money(n);
  }

  function computeBusinessStats(filters){
    filters = filters || {};
    var dateFrom = filters.dateFrom || "";
    var dateTo = filters.dateTo || "";
    var trips = state.trips.filter(function(tr){ return inDateRange(tr.date, dateFrom, dateTo); });
    var exp = {};
    ["fuel","service","adblue","challan","salary"].forEach(function(type){
      exp[type] = (state.expenses[type]||[]).filter(function(e){ return inDateRange(e.date, dateFrom, dateTo); });
    });
    var rtgsList = state.rtgsEntries.filter(function(r){ return inDateRange(r.date, dateFrom, dateTo); });
    var branchExpList = state.branchExpenses.filter(function(r){ return inDateRange(r.date, dateFrom, dateTo); });
    var vehicleRevenue = {}, vehicleTripCount = {}, vehicleCost = {};

    trips.forEach(function(tr){
      vehicleRevenue[tr.truckId] = (vehicleRevenue[tr.truckId]||0) + tripFreight(tr);
      vehicleTripCount[tr.truckId] = (vehicleTripCount[tr.truckId]||0) + 1;
    });
    ["fuel","service","adblue","challan"].forEach(function(type){
      (exp[type]||[]).forEach(function(e){
        if(!e.truckId) return;
        vehicleCost[e.truckId] = (vehicleCost[e.truckId]||0) + expenseAmount(type, e);
      });
    });
    var vehicleProfit = {};
    state.trucks.forEach(function(t){ vehicleProfit[t.id] = (vehicleRevenue[t.id]||0) - (vehicleCost[t.id]||0); });

    var routeProfit = {}, routeRevenue = {}, routeCount = {};
    trips.forEach(function(tr){
      var route = (tr.from||"?")+" → "+(tr.to||"?");
      var net = tripFreight(tr) - num(tr.comm) - num(tr.charges) - num(tr.tds);
      routeProfit[route] = (routeProfit[route]||0) + net;
      routeRevenue[route] = (routeRevenue[route]||0) + tripFreight(tr);
      routeCount[route] = (routeCount[route]||0) + 1;
    });

    var mileageSum = {}, mileageCount = {};
    (exp.fuel||[]).forEach(function(e){
      var m = fuelMileage(e);
      if(m!=null && isFinite(m) && m>0){
        mileageSum[e.truckId] = (mileageSum[e.truckId]||0) + m;
        mileageCount[e.truckId] = (mileageCount[e.truckId]||0) + 1;
      }
    });
    var vehicleAvgMileage = {};
    Object.keys(mileageSum).forEach(function(id){ vehicleAvgMileage[id] = mileageSum[id]/mileageCount[id]; });

    var managerSalaryCost = {};
    (exp.salary||[]).forEach(function(e){
      var drv = state.drivers.find(function(d){return d.name===e.driverName;});
      if(!drv || !drv.managerName) return;
      var sign = e.type==="Deduction" ? -1 : 1;
      managerSalaryCost[drv.managerName] = (managerSalaryCost[drv.managerName]||0) + sign*num(e.amount);
    });
    var managerStats = state.managers.map(function(m){
      var ids = m.vehicleIds||[];
      var rev=0, cost=0;
      ids.forEach(function(id){ rev += vehicleRevenue[id]||0; cost += vehicleCost[id]||0; });
      cost += managerSalaryCost[m.name]||0;
      var profit = rev-cost;
      return {name:m.name, revenue:rev, cost:cost, profit:profit, margin: rev>0 ? (profit/rev*100) : null};
    });

    var partyProfit = {};
    trips.forEach(function(tr){
      var p = tr.party || "Unknown";
      var net = tripFreight(tr) - num(tr.comm) - num(tr.charges) - num(tr.tds);
      partyProfit[p] = (partyProfit[p]||0) + net;
    });

    var totalRevenue = trips.reduce(function(s,tr){return s+tripFreight(tr);},0);
    // The Daily Dispatch & RTGS side (branches) earns a brokerage margin
    // rather than a freight revenue/cost pair, so it's folded into the
    // combined EWR-wide totals as its own revenue/cost pair here.
    var rtgsTotalMargin = rtgsList.reduce(function(s,r){return s+rtgsMargin(r);},0);
    var rtgsTotalBookingSum = rtgsList.reduce(function(s,r){return s+rtgsTotalBooking(r);},0);
    var rtgsTotalLorrySum = rtgsList.reduce(function(s,r){return s+rtgsTotalLorry(r);},0);
    var totalBranchExpense = branchExpList.reduce(function(s,r){return s+num(r.amount);},0);
    var totalFuelCost = (exp.fuel||[]).reduce(function(s,e){return s+expenseAmount("fuel",e);},0);
    var totalServiceCost = (exp.service||[]).reduce(function(s,e){return s+num(e.amount);},0);
    var totalAdblueCost = (exp.adblue||[]).reduce(function(s,e){return s+expenseAmount("adblue",e);},0);
    var totalChallanCost = (exp.challan||[]).reduce(function(s,e){return s+num(e.amount);},0);
    var totalSalaryCost = (exp.salary||[]).reduce(function(s,e){ var sign=e.type==="Deduction"?-1:1; return s+sign*num(e.amount); },0);
    var totalExpenses = totalFuelCost+totalServiceCost+totalAdblueCost+totalChallanCost+totalSalaryCost;
    var pendingChallans = (exp.challan||[]).filter(function(e){return e.status==="Pending";});

    // Last 6 months of revenue/expense/profit, for the trend charts.
    var months = monthKeysBack(6);
    var monthRevenue = {}, monthExpense = {};
    months.forEach(function(mk){ monthRevenue[mk]=0; monthExpense[mk]=0; });
    trips.forEach(function(tr){
      var mk = tr.date ? tr.date.slice(0,7) : null;
      if(mk && monthRevenue.hasOwnProperty(mk)) monthRevenue[mk] += tripFreight(tr);
    });
    ["fuel","service","adblue","challan"].forEach(function(type){
      (exp[type]||[]).forEach(function(e){
        var mk = e.date ? e.date.slice(0,7) : null;
        if(mk && monthExpense.hasOwnProperty(mk)) monthExpense[mk] += expenseAmount(type, e);
      });
    });
    (exp.salary||[]).forEach(function(e){
      var mk = e.date ? e.date.slice(0,7) : null;
      if(mk && monthExpense.hasOwnProperty(mk)){ var sign=e.type==="Deduction"?-1:1; monthExpense[mk]+=sign*num(e.amount); }
    });

    // Real alerts — every line here comes from actual data, nothing invented.
    var alerts = [];
    pendingChallans.forEach(function(e){
      var truck = findTruck(e.truckId);
      alerts.push({type:"challan", text:(truck?truck.truckNo:"Unknown vehicle")+" — pending challan ₹"+money(num(e.amount))+(e.violation?" ("+e.violation+")":""), when:e.date});
    });
    state.trucks.forEach(function(t){
      var p = vehicleProfit[t.id];
      if(p!=null && p<0) alerts.push({type:"loss", text:t.truckNo+" is running at a loss (₹"+money(Math.abs(p))+")", when:null});
    });
    alerts.sort(function(a,b){ return (b.when||"").localeCompare(a.when||""); });

    function topBy(map, wantMax){
      var bestId=null, bestVal=null;
      Object.keys(map).forEach(function(id){
        var v = map[id];
        if(bestVal===null || (wantMax ? v>bestVal : v<bestVal)){ bestVal=v; bestId=id; }
      });
      return bestId===null ? null : {key:bestId, val:bestVal};
    }

    return {
      vehicleRevenue:vehicleRevenue, vehicleCost:vehicleCost, vehicleProfit:vehicleProfit,
      vehicleTripCount:vehicleTripCount, vehicleAvgMileage:vehicleAvgMileage,
      routeProfit:routeProfit, routeRevenue:routeRevenue, routeCount:routeCount,
      managerStats:managerStats, partyProfit:partyProfit,
      totalRevenue:totalRevenue, totalFuelCost:totalFuelCost, totalServiceCost:totalServiceCost,
      totalAdblueCost:totalAdblueCost, totalChallanCost:totalChallanCost, totalSalaryCost:totalSalaryCost,
      totalExpenses:totalExpenses, netProfit:(totalRevenue-totalExpenses)+rtgsTotalMargin-totalBranchExpense,
      rtgsTotalMargin:rtgsTotalMargin, rtgsTotalBookingSum:rtgsTotalBookingSum, rtgsTotalLorrySum:rtgsTotalLorrySum,
      totalBranchExpense: totalBranchExpense,
      combinedRevenue: totalRevenue + rtgsTotalBookingSum,
      combinedExpense: totalExpenses + rtgsTotalLorrySum + totalBranchExpense,
      combinedProfit: (totalRevenue + rtgsTotalBookingSum) - (totalExpenses + rtgsTotalLorrySum + totalBranchExpense),
      outstandingBalance: trips.reduce(function(s,tr){return s+tripBalRemaining(tr);},0),
      pendingChallanCount: pendingChallans.length,
      pendingChallanAmount: pendingChallans.reduce(function(s,e){return s+num(e.amount);},0),
      mostProfitableVehicle: topBy(vehicleProfit, true),
      mostLossVehicle: topBy(vehicleProfit, false),
      mostMileageVehicle: topBy(vehicleAvgMileage, true),
      mostTripsVehicle: topBy(vehicleTripCount, true),
      mostProfitableRoute: topBy(routeProfit, true),
      mostLossRoute: topBy(routeProfit, false),
      totalTrips: trips.length,
      totalVehicles: state.trucks.length,
      months: months, monthRevenue: monthRevenue, monthExpense: monthExpense,
      alerts: alerts
    };
  }

  // ---------- Own Fleet Dashboard ----------
  // Resolves the active Own Fleet filters (company / manager / date range)
  // into a concrete {from, to} date string pair. "custom" uses the stored
  // dateFrom/dateTo directly; the named presets are computed fresh so they
  // always mean "today" relative to when the dashboard is viewed.
  function resolveOwnFleetRange(filters){
    if(filters.preset==="custom") return {from:filters.dateFrom||"", to:filters.dateTo||""};
    if(filters.preset==="all") return {from:"", to:""};
    return dateRangeFromPreset(filters.preset);
  }


  function inDateRange(dateStr, from, to){
    if(!dateStr) return !from && !to; // undated records only show up when no date filter is active
    if(from && dateStr<from) return false;
    if(to && dateStr>to) return false;
    return true;
  }


  function tripMatchesFilter(tr, q){
    if(!q) return true;
    q = q.toLowerCase();
    return TRIP_COLUMNS.some(function(c){
      if(TRIP_FILTER_KEYS.indexOf(c.key)===-1) return false;
      return String(c.get(tr)).toLowerCase().indexOf(q)>-1;
    });
  }