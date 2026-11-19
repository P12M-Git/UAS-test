import {driverDisplayParts} from "../src/models/display-driver";
export default function DriverName({name}:{name:string}){
  const {surname,given}=driverDisplayParts(name);
  return <span className="driver-display"><strong>{surname}</strong>{given&&<>, {given}</>}</span>;
}
