import { mount } from 'svelte';

import '@/assets/theme.css';
import './options.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
