// Explicit identity aliases only: never infer identity from surname similarity.
export function normaliseDriverName(name:string):string {
  return name.toLowerCase().replace(/ı/g,"i").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
}
const aliases:Record<string,string>={
  alexanderquinn:"alexquinn",
  benjaminhanley:"benhanley",
  cembolukbas:"cembolukbasi", // supplied normalized CSV omits Turkish dotless i
  nicholasyelloly:"nickyelloly",
  nicholasyelolly:"nickyelloly",
  nickyelolly:"nickyelloly",
  horstfelbermayr:"horstfelbermayrjr",
  horstjrfelbermayr:"horstfelbermayrjr",
  horstfelbermayrjunior:"horstfelbermayrjr",
  scotthuffakerii:"scotthuffaker",
  scotthufakkerii:"scotthuffaker",
  scotthufakker:"scotthuffaker",
};
export function driverIdentityKey(name:string):string {
  const key=normaliseDriverName(name);return aliases[key]||key;
}

// Category lookup only: do not merge race identities based on a typo.
// Accept one edit (including adjacent transposition), only with a unique match.
export function matchDriverCategoryKey(name:string, candidates:Iterable<string>):string|undefined {
  const key=driverIdentityKey(name), keys=new Set(candidates);
  if(keys.has(key))return key;
  if(key.length<8)return undefined;
  const matches=[...keys].filter(candidate=>candidate.length>=8 && oneEditApart(key,candidate));
  return matches.length===1?matches[0]:undefined;
}

function oneEditApart(a:string,b:string):boolean {
  if(Math.abs(a.length-b.length)>1)return false;
  let i=0;
  while(i<Math.min(a.length,b.length)&&a[i]===b[i])i++;
  if(a.length===b.length){
    return a.slice(i+1)===b.slice(i+1) ||
      (a[i]===b[i+1]&&a[i+1]===b[i]&&a.slice(i+2)===b.slice(i+2));
  }
  return a.length>b.length?a.slice(i+1)===b.slice(i):a.slice(i)===b.slice(i+1);
}
