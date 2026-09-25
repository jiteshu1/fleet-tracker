  var SESSION_STORAGE_KEY = "ft-session";


  function decodeTokenPayload(token){
    try{
      var b64 = String(token).split(".")[0].replace(/-/g,"+").replace(/_/g,"/");
      while(b64.length % 4) b64 += "=";
      return JSON.parse(atob(b64));
    }catch(e){ return null; }
  }


  function persistSession(token){
    try{ localStorage.setItem(SESSION_STORAGE_KEY, token); }catch(e){}
  }


  function clearPersistedSession(){
    try{ localStorage.removeItem(SESSION_STORAGE_KEY); }catch(e){}
  }

  function restoreSession(){
    var token;
    try{ token = localStorage.getItem(SESSION_STORAGE_KEY); }catch(e){ return null; }
    if(!token) return null;
    var payload = decodeTokenPayload(token);
    if(!payload || typeof payload.exp!=="number" || payload.exp<Date.now() || !payload.name || !payload.role){
      clearPersistedSession();
      return null;
    }
    return {token:token, name:payload.name, role:payload.role};
  }