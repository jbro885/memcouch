import { strict as assert } from 'assert';

import Memcouch from "./memcouch.mjs";

let db = new Memcouch();

db.update({_id:'A', _rev:1, value:0})
db.set({_id:'A', _rev:1, value:1})
db.set({_id:'A', _rev:1, value:2})
db.update({_id:'A', _rev:2, value:42})
db.set({_id:'A', _rev:1, value:3})

let g = db.allDocs;
db.set({_id:'B', value:true})
console.log(Array.from(g));
console.log(Array.from(db.allDocs));
