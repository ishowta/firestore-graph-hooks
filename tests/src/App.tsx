import { useEffect, useRef } from "react";
import { useTest } from "./test";

function App() {
  useTest();
  return <div>Hello World!</div>;
}

export default App;
