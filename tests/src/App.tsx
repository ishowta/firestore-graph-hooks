import { useEffect, useRef } from "react";
import { generateSeed, test } from "./seed";
import { useTest } from "./test";

function App() {
  useTest();
  return (
    <div>
      Hello World!
      <button
        onClick={() => {
          test();
        }}
      >
        test
      </button>
    </div>
  );
}

export default App;
