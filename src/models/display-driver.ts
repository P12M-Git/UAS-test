import {driverSurname} from "./driver-identity";
export function driverDisplayParts(name:string) {
  if(name.includes(",")){const [surname,...given]=name.split(",");return {surname:surname.trim().toLocaleUpperCase(),given:given.join(",").trim()};}
  const surname=driverSurname(name);
  const index=name.toLocaleLowerCase().lastIndexOf(surname.toLocaleLowerCase());
  const given=index>0?name.slice(0,index).trim():"";
  const suffix=index>=0?name.slice(index+surname.length).trim():"";
  return {surname:[surname,suffix].filter(Boolean).join(" ").toLocaleUpperCase(),given};
}
export function displayDriverName(name:string){const {surname,given}=driverDisplayParts(name);return `${surname}${given?`, ${given}`:""}`;}
