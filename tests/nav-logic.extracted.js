  var EXPENSE_TYPES = {
    fuel: {
      key:"fuel", label:"Fuel Expense", icon:"fuel", scope:"vehicle",
      fields:[
        {key:"date", label:"Date", type:"date"},
        {key:"odometer", label:"Odometer Reading", type:"number", aliases:["ODOMETER","ODO","KM","ODOMETER KM"]},
        {key:"liters", label:"Liters Filled", type:"number", aliases:["LITERS","LITRES","QTY","QUANTITY","LTR","LTRS"]},
        {key:"rate", label:"Rate/Liter (₹)", type:"number", aliases:["RATE","PRICE","RATE PER LITER","PRICE PER LITER","RATE/LITRE"]},
        {key:"amount", label:"Total Amount (₹)", type:"number", auto:true},
        {key:"fullTank", label:"Filled to full?", type:"select", options:["Yes","No"], aliases:["FULL TANK","FULL","TANK FULL","IS FULL"]},
        {key:"location", label:"Pump/Location", type:"text", aliases:["LOCATION","PUMP","PUMP NAME"]}
      ]
    },
    service: {
      key:"service", label:"Service Expense", icon:"wrench", scope:"vehicle",
      fields:[
        {key:"date", label:"Date", type:"date"},
        {key:"type", label:"Type", type:"select", options:["Service","Tyre","Other"]},
        {key:"description", label:"Description", type:"text"},
        {key:"amount", label:"Amount (₹)", type:"number"},
        {key:"odometer", label:"Odometer", type:"number"},
        {key:"vendor", label:"Garage/Vendor", type:"text"}
      ]
    },
    adblue: {
      key:"adblue", label:"Adblue Expense", icon:"fuel", scope:"vehicle",
      fields:[
        {key:"date", label:"Date", type:"date"},
        {key:"liters", label:"Liters", type:"number"},
        {key:"rate", label:"Rate (₹)", type:"number"},
        {key:"amount", label:"Total Amount (₹)", type:"number", auto:true}
      ]
    },
    salary: {
      key:"salary", label:"Driver Salary", icon:"driver", scope:"driver",
      fields:[
        {key:"date", label:"Date", type:"date"},
        {key:"type", label:"Payment Type", type:"select", options:["Monthly Salary","Advance","Other Expense","Deduction"]},
        {key:"amount", label:"Amount (₹)", type:"number"},
        {key:"description", label:"Description", type:"text"}
      ]
    },
    challan: {
      key:"challan", label:"Traffic Challans", icon:"alert", scope:"vehicle",
      fields:[
        {key:"date", label:"Date", type:"date"},
        {key:"challanNo", label:"Challan Number", type:"text"},
        {key:"violation", label:"Violation Type", type:"text"},
        {key:"amount", label:"Amount (₹)", type:"number"},
        {key:"location", label:"Location", type:"text"},
        {key:"paidStatus", label:"Paid Status", type:"select", options:["Paid","Pending"]}
      ]
    }
  };


  var EXPENSE_ORDER = ["fuel","service","adblue","salary","challan"];
  var EXPENSE_NAV_ITEMS = EXPENSE_ORDER.map(function(k){
    var e = EXPENSE_TYPES[k];
    return {act:"expense-home", extra:{name:k}, label:e.label, icon:e.icon, match:["expense:"+k]};
  });
  // Driver Hisaab's exact fields are still TBD — a simple placeholder page for
  // now rather than guessing at a schema and having to rebuild it later.
  EXPENSE_NAV_ITEMS.splice(4, 0, {act:"driver-hisaab-home", label:"Driver Hisaab", icon:"driver", match:["driverHisaab"]});



  function ewrRoadlinesCompany(){
    return state.companies.find(function(c){ return (c.name||"").trim().toLowerCase()==="east west roadlines"; }) || null;
  }

  function sessionCompany(){
    if(!state.session || state.session.role!=="company") return null;
    return state.companies.find(function(c){return c.name===state.session.name;}) || null;
  }

  function sidebarGroups(){
    if(!state.session) return [];
    var role = state.session.role, groups = [];
    if(role==="admin"){
      groups = [
        {key:"ewr", label:null, items:[
          {act:"business-home", label:"EWR Dashboard", icon:"business", match:["bizDashboard","bizDetail"]}
        ]},
        {key:"tracking", label:"Fleet Tracking", items:[
          {act:"tracking-home", label:"Dashboard", icon:"dashboard", match:["dashboard"]},
          {act:"live-map", label:"Live map", icon:"map", match:["liveMap"]}
        ]},
        {key:"ownfleet", label:"Own Fleets Dispatch", items:[
          {act:"own-fleet-home", label:"Dashboard", icon:"business", match:["ownFleetDashboard"]},
          {act:"dispatch-home", label:"Fleet Dispatch", icon:"dispatch", match:["dispatchDashboard","addTrip","editTrip"]},
          {isSubGroup:true, key:"expenses", label:"Fleet Expenses", icon:"fuel", items: EXPENSE_NAV_ITEMS}
        ]},
        {key:"branchdash", label:"Branch Dispatch", items:[
          {act:"branch-dash-home", label:"Dashboard", icon:"business", match:["branchDashboard"]},
          {act:"rtgs-home", label:"Daily Dispatch & RTGS", icon:"rtgs", match:["rtgsDashboard","addRtgs","editRtgs"]},
          {act:"branch-expense-home", label:"Branch Expense", icon:"fuel", match:["branchExpenseDashboard","addBranchExpense","editBranchExpense"]},
          {act:"branches-list", label:"Branches", icon:"manager", match:["branches","addBranch","editBranch"]}
        ]},
        {key:"admin", label:"Admin", items:[
          {isSubGroup:true, key:"management", label:"Fleet Management", icon:"vehicles", items:[
            {act:"vehicles-list", label:"Vehicles", icon:"vehicles", match:["vehicles"]},
            {act:"drivers-list", label:"Drivers", icon:"driver", match:["drivers","addDriver","editDriver"]},
            {act:"managers", label:"Managers", icon:"manager", match:["managers","addManager","editManager","managerFleet"]},
            {act:"companies-list", label:"Companies", icon:"business", match:["companies","addCompany","editCompany"]}
          ]},
          {act:"manage-users", label:"Users", icon:"users", match:["users","addUser","editUser"]},
          {act:"settings", label:"Settings", icon:"settings", match:["settings"]}
        ]}
      ];
    } else if(role==="company"){
      groups = [
        {key:"ewr", label:null, items:[
          {act:"business-home", label:"Dashboard", icon:"business", match:["bizDashboard","bizDetail"]}
        ]},
        {key:"ownfleet", label:"Own Fleets Dispatch", items:[
          {act:"own-fleet-home", label:"Dashboard", icon:"business", match:["ownFleetDashboard"]},
          {act:"dispatch-home", label:"Fleet Dispatch", icon:"dispatch", match:["dispatchDashboard","addTrip","editTrip"]},
          {isSubGroup:true, key:"expenses", label:"Fleet Expenses", icon:"fuel", items: EXPENSE_NAV_ITEMS}
        ]}
      ];
      // Branch Dispatch only exists for East West Roadlines — every other
      // company login never sees the group at all.
      var _sessCo = sessionCompany(), _ewrCo = ewrRoadlinesCompany();
      if(_sessCo && _ewrCo && _sessCo.id===_ewrCo.id){
        groups.push({key:"branchdash", label:"Branch Dispatch", items:[
          {act:"branch-dash-home", label:"Dashboard", icon:"business", match:["branchDashboard"]},
          {act:"rtgs-home", label:"Daily Dispatch & RTGS", icon:"rtgs", match:["rtgsDashboard","addRtgs","editRtgs"]},
          {act:"branch-expense-home", label:"Branch Expense", icon:"fuel", match:["branchExpenseDashboard","addBranchExpense","editBranchExpense"]}
        ]});
      }
    } else if(role==="manager"){
      groups = [
        {key:"tracking", label:"Fleet Tracking", items:[
          {act:"home", label:"My fleet", icon:"dashboard", match:["managerFleet:own"]},
          {act:"mgr-select", extra:{name:"__all__"}, label:"All vehicles", icon:"vehicles", match:["managerFleet:all"]},
          {act:"live-map", label:"Live map", icon:"map", match:["liveMap"]}
        ]},
        {key:"dispatch", label:"Fleet Dispatch", items:[
          {act:"dispatch-home", label:"Dispatch board", icon:"dispatch", match:["dispatchDashboard","addTrip","editTrip"]}
        ]},
        {key:"expenses", label:"Fleet Expenses", items: EXPENSE_NAV_ITEMS}
      ];
    } else if(role==="branch"){
      groups = [
        {key:"rtgs", label:null, items:[
          {act:"rtgs-home", label:"Daily Dispatch & RTGS", icon:"rtgs", match:["rtgsDashboard","addRtgs","editRtgs"]},
          {act:"branch-expense-home", label:"Branch Expense", icon:"fuel", match:["branchExpenseDashboard","addBranchExpense","editBranchExpense"]}
        ]}
      ];
    } else {
      groups = [
        {key:"tracking", label:null, items:[
          {act:"home", label:"My trucks", icon:"vehicles", match:["mytrucks","dashboard","editTruck"]}
        ]}
      ];
    }
    return groups;
  }

  function flattenNavItems(groups){
    var out = [];
    groups.forEach(function(g){
      g.items.forEach(function(it){
        if(it.isSubGroup){ (it.items||[]).forEach(function(sub){ out.push(sub); }); }
        else out.push(it);
      });
    });
    return out;
  }

  function isMobileViewport(){
    return typeof window !== "undefined" && typeof window.innerWidth === "number" && window.innerWidth < 900;
  }