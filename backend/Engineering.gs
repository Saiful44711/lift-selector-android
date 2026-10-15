function calculateEnergyBill(token,input){authUser_(token,LiftCore.roles('calculate'));return LiftCore.calculate('calculateEnergyBill',input);}
function calculateSolarSizing(token,input){authUser_(token,LiftCore.roles('calculate'));return LiftCore.calculate('calculateSolarSizing',input);}
