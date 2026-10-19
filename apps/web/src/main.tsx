import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from './i18n.js';
import { App } from './App.js';
import { ThemeProvider, initializeTheme } from './theme.js';
import './styles.css';
import './Dropdown.css';
import './json-viewer.css';
import './code-editor.css';
import './evaluation-concepts.css';

initializeTheme();
createRoot(document.getElementById('root')!).render(<StrictMode><ThemeProvider><LanguageProvider><App /></LanguageProvider></ThemeProvider></StrictMode>);
