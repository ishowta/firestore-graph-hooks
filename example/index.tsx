import 'react-app-polyfill/ie11';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { useTest } from './test';
import { generateSeed } from '../test/seed';

const App = () => {
  useTest();
  return (
    <div>
      <button onClick={generateSeed}>Seed</button>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));
