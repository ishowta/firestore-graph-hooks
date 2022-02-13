import { useEffect, useRef } from "react";
import { generateSeed } from "./seed";
import { useTest } from "./test";

function App() {
  useTest();
  return (
    <div>
      Hello World!
      <button onClick={() => {}}>test</button>
    </div>
  );
}

export default App;
