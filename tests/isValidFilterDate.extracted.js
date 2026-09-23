  function isValidFilterDate(v){
    if(!v) return true;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if(!m) return false;
    var year = Number(m[1]);
    if(year < 2015 || year > 2035) return false;
    var d = new Date(v+"T00:00:00");
    return !isNaN(d.getTime());
  }