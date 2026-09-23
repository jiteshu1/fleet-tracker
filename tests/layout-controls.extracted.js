  var ICONS = {
    dashboard:'<path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-16v5h6V4h-6z"/>',
    vehicles:'<path d="M3 16V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v2h2.6a1 1 0 0 1 .86.49l2.4 4A1 1 0 0 1 21 13v3a1 1 0 0 1-1 1h-1a2 2 0 1 1-4 0H8a2 2 0 1 1-4 0H3zM14 8v6h5v-2.7l-2-3.3H14zM6 17.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm10 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/>',
    map:'<path d="M9 3 3 5.5v15.5l6-2.5 6 2.5 6-2.5V3l-6 2.5L9 3zm0 2.2 6 2.5v11.1l-6-2.5V5.2zM5 6.9l2-.8v11l-2 .8v-11zm14-.8v11l-2 .8v-11l2-.8z"/>',
    driver:'<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/>',
    manager:'<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/><path d="M17 8h4M19 6v4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    users:'<path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8-1a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM8 14c-4 0-7 2-7 4.5V21h11v-2.5c0-1-.3-1.9-.9-2.7A9 9 0 0 0 8 14zm8 .2c-.6 0-1.2.06-1.8.17.9 1 1.4 2.2 1.4 3.6V21h6.4v-2.1c0-2.3-2.6-4.7-6-4.7z"/>',
    settings:'<path d="M19.4 13a7.6 7.6 0 0 0 .07-1 7.6 7.6 0 0 0-.07-1l2.1-1.6a.5.5 0 0 0 .12-.66l-2-3.4a.5.5 0 0 0-.6-.22l-2.5 1a7.4 7.4 0 0 0-1.7-1L14.4 2.5a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4L9 5.1a7.4 7.4 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.22l-2 3.4a.5.5 0 0 0 .12.66L4.4 11a7.6 7.6 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.12.66l2 3.4a.5.5 0 0 0 .6.22l2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6a.5.5 0 0 0 .5.4h4a.5.5 0 0 0 .5-.4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1a.5.5 0 0 0 .6-.22l2-3.4a.5.5 0 0 0-.12-.66L19.4 13zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/>',
    profile:'<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/>',
    logout:'<path d="M10 3h6a1 1 0 0 1 1 1v3h-2V5h-5v14h5v-2h2v3a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm5.6 8H4v2h11.6l-2.3 2.3 1.4 1.4L19 12l-4.3-4.3-1.4 1.4L15.6 11z"/>',
    search:'<path d="M10 4a6 6 0 1 0 3.8 10.6l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/>',
    edit:'<path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.33-2.33a1 1 0 0 0-1.41 0L15.13 5.13l3.75 3.75 1.82-1.84z"/>',
    view:'<path d="M12 5c-5.5 0-9.3 4.6-10 7 .7 2.4 4.5 7 10 7s9.3-4.6 10-7c-.7-2.4-4.5-7-10-7zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9zm0-7.2A2.7 2.7 0 1 0 12 14.8a2.7 2.7 0 0 0 0-5.4z"/>',
    location:'<path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>',
    status:'<path d="M12 2 2 12l10 10 10-10L12 2zm0 3.8 6.2 6.2L12 18.2 5.8 12 12 5.8z"/>',
    sun:'<path d="M12 4a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1zm0 14a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zm8-6a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1zM6 12a1 1 0 0 1-1 1H4a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1zm11.3-6.3a1 1 0 0 1 0 1.4l-.7.7a1 1 0 1 1-1.4-1.4l.7-.7a1 1 0 0 1 1.4 0zM8.8 17.5a1 1 0 0 1 0 1.4l-.7.7a1 1 0 1 1-1.4-1.4l.7-.7a1 1 0 0 1 1.4 0zm8.5 1.4a1 1 0 0 1-1.4 0l-.7-.7a1 1 0 1 1 1.4-1.4l.7.7a1 1 0 0 1 0 1.4zM8.1 6.5A1 1 0 0 1 6.7 5.1l-.7-.7a1 1 0 0 1 1.4-1.4l.7.7a1 1 0 0 1 0 1.4zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>',
    moon:'<path d="M20.7 14.9A8.5 8.5 0 1 1 9.1 3.3a.6.6 0 0 1 .7.9 7 7 0 0 0 9 9 .6.6 0 0 1 .9.7z"/>',
    package:'<path d="M12 2 3 6.5V17.5L12 22l9-4.5V6.5L12 2zm0 2.2 6.2 3.1L12 10.4 5.8 7.3 12 4.2zM5 9l6 3v7.3l-6-3V9zm14 0v7.3l-6 3V12l6-3z"/>',
    transit:'<path d="M3 16V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v2h2.6a1 1 0 0 1 .86.49l2.4 4A1 1 0 0 1 21 13v3a1 1 0 0 1-1 1h-1a2 2 0 1 1-4 0H8a2 2 0 1 1-4 0H3zM14 8v6h5v-2.7l-2-3.3H14zM6 17.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm10 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/><path d="M1 10h2M0 12.5h2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    unload:'<path d="M12 2 3 6.5V17.5L12 22l9-4.5V6.5L12 2zm0 2.2 6.2 3.1L12 10.4 5.8 7.3 12 4.2zM5 9l6 3v3.1l-6-3V9zm14 0v3.1l-6 3V12l6-3z"/><path d="M12 15.5v5M9.5 18l2.5 2.5L14.5 18" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    wrench:'<path d="M21.7 18.3 15 11.6a5 5 0 0 0-6.1-6l3 3-1.4 4-4 1.4-3-3a5 5 0 0 0 6 6.1l6.7 6.7a1.5 1.5 0 0 0 2.1 0l1.4-1.4a1.5 1.5 0 0 0 0-2.1z"/>',
    download:'<path d="M12 3v10.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4 3.6 3.6V3h2zM5 19h14v2H5v-2z"/>',
    dispatch:'<path d="M3 4h13v9H3V4zm2 2v5h9V6H5zm11 2h3.4l2.6 3.2V15h-2a2 2 0 1 1-4 0h-2V8h2zm.5 5.3v-3.2l1.5 1.9v1.3h-1.5zM8 17a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>',
    business:'<path d="M4 19h2v-7H4v7zm5 0h2V9H9v10zm5 0h2v-5h-2v5zm5 0h2V4h-2v15zM3 21h18v-1.5H3V21z"/>',
    rtgs:'<path d="M3 6h18v4H3V6zm0 6h18v2H3v-2zm0 5h18v2H3v-2zm5-9h2v2H8v-2z"/>',
    trend:'<path d="M3 17.5 9 11l4 4 8-9 1.5 1.3-9 10.3-4-4-6.5 6.9L2 18.7z"/>',
    party:'<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5z"/>',
    add:'<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"/>',
    upload:'<path d="M12 3l5 5-1.4 1.4L13 6.8V16h-2V6.8L8.4 9.4 7 8l5-5zM5 19h14v2H5v-2z"/>',
    trash:'<path d="M9 3h6l1 2h4v2H4V5h4l1-2zM6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8zm3 2v9h1.5v-9H9zm4.5 0v9H15v-9h-1.5z"/>',
    chevDown:'<path d="M7 10l5 5 5-5z"/>',
    chevRight:'<path d="M10 7l5 5-5 5z"/>',
    fuel:'<path d="M4 3h9v18H4V3zm2 2v6h5V5H6zM13 7l3.5 3.5c.6.6.9 1.3.9 2.1V18a2 2 0 0 1-4 0v-3a1 1 0 0 0-1-1h-.4v-2h.4a2.5 2.5 0 0 1 2.5 2.5v2.9a.6.6 0 0 0 1.2 0v-5.6c0-.3-.1-.6-.3-.8L13 8.4V7zM3 20h11v1.5H3V20z"/>',
    alert:'<path d="M12 2 1 21h22L12 2zm0 6a1.3 1.3 0 0 1 1.3 1.3l-.3 5.2h-2l-.3-5.2A1.3 1.3 0 0 1 12 8zm0 8.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z"/>',
    expand:'<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>',
    collapse:'<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>'
  };


  function icon(name, size){
    var s = size || 16;
    return '<svg class="ic" width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-3px;flex-shrink:0;">'+(ICONS[name]||'')+'</svg>';
  }

  function esc(s){ return (s===undefined||s===null?"":String(s)).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }

  var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function monthLabel(m){
    if(m==='unknown') return 'No date recorded';
    var parts = m.split('-');
    return MONTH_NAMES[parseInt(parts[1],10)-1]+' '+parts[0];
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