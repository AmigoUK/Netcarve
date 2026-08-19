import { render } from 'preact';
import { Popup } from './Popup';
import './style.css';

const version = __NETCARVE_VERSION__;

render(<Popup version={version} />, document.getElementById('root') as HTMLElement);
