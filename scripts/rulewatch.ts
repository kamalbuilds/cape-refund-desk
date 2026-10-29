import { runRuleWatch } from "../src/lib/rulewatch";
runRuleWatch().then((r) => { console.log(JSON.stringify({ ...r, added: r.added.slice(0, 25), removed: r.removed.slice(0, 25) }, null, 1)); console.log("total added/removed", r.added.length, r.removed.length); });
