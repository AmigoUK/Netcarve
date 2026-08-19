import { render } from 'preact';
import { App } from './App';
import './style.css';

const version = __NETCARVE_VERSION__;

render(<App version={version} />, document.getElementById('root') as HTMLElement);
