'use strict';

import mn from './mini.js'

await mn.init({
  router: {
    '/': 'home',
    '/home': 'home',
    'calendar': 'calendar'
  }
})

mn.run();
