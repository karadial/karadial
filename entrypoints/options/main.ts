import { mount } from 'svelte';

import '@/assets/theme.css';
import './options.css';
import { initAppearance } from '@/lib/settings/appearance';

import App from './App.svelte';

initAppearance();
mount(App, { target: document.getElementById('app')! });
