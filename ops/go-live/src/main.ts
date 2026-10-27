/**
 * go-live: sets up IAR's Google Workspace and Google Cloud for the IAR Portal
 * and deploys it. Show-only unless --apply. See ops/go-live/README.md.
 *
 *   npm --prefix ops/go-live start                  show every change, change nothing
 *   npm --prefix ops/go-live start -- --apply       make them, asking before each step
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { DEFAULTS, goLive } from "./go-live";
import { RealGoogle } from "./google-real";
import { EXTRA_STAGE_IDS, STAGE_IDS, type Options, type Prompt, type StageId, type State } from "./types";

const PKG = join(__dirname, "..", "..", "..", "..");
const REPO = join(PKG, "..", "..");
const STATE_FILE = join(PKG, ".state.json");

const HELP = `go-live: set up Google for the IAR Portal and deploy it.

  npm --prefix ops/go-live start -- [options]

  (no options)        Show every change it would make, by step. Changes nothing.
  --apply             Make the changes. Asks "Apply? (y/N)" before each step.
  --template          Make the blank members Sheet in your Drive, then stop.
  --sheet <link>      The filled-in members Sheet (remembered after the first run).
  --only <step>       Run one step (plus the sign-in, and the Sheet if it needs it).
                      Steps: ${STAGE_IDS.join(", ")}
                      Extra steps, only with --only: ${EXTRA_STAGE_IDS.join(", ")}
                      (autodeploy: deploy the portal each time a change is merged)
  --sync              Also list people in the portal groups who aren't on the Sheet,
                      and remove them after a separate yes.
  --redeploy          Rebuild and deploy the current portal code.
  --production        Open the portal to every account, not just the testers (asks first).
  --project <id>      Cloud project (default ${DEFAULTS.project}).
  --region <region>   Cloud region (default ${DEFAULTS.region}).
  --domain <domain>   Workspace domain (default ${DEFAULTS.domain}).
  --client <file>     go-live's Desktop sign-in client (default ops/go-live/client_secret*.json).
`;

export function parseArgs(argv: string[]): Options {
  const o: Options = { ...DEFAULTS };
  const value = (i: number, flag: string) => {
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) throw new Error(`${flag} needs a value.`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    const take = () => inline ?? value(i++, flag);
    switch (flag) {
      case "--apply": o.apply = true; break;
      case "--template": o.template = true; break;
      case "--sync": o.sync = true; break;
      case "--production": o.production = true; break;
      case "--redeploy": o.redeploy = true; break;
      case "--sheet": o.sheet = take(); break;
      case "--project": o.project = take(); break;
      case "--region": o.region = take(); break;
      case "--domain": o.domain = take().toLowerCase(); break;
      case "--client": o.client = take(); break;
      case "--only": {
        const s = take() as StageId;
        const all: readonly string[] = [...STAGE_IDS, ...EXTRA_STAGE_IDS];
        if (!all.includes(s)) throw new Error(`--only takes one of: ${all.join(", ")}`);
        o.only = s;
        break;
      }
      case "--help": case "-h": console.log(HELP); process.exit(0);
      default: throw new Error(`Unknown option ${a}. Run with --help to see them.`);
    }
  }
  return o;
}

function loadState(): State {
  if (!existsSync(STATE_FILE)) return { version: 1 };
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
}

async function saveState(s: State) {
  const tmp = `${STATE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, STATE_FILE);
}

/** Questions in the terminal. Secrets are read without showing what's typed. */
function terminalPrompt(): Prompt {
  return (q) =>
    new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
      if (q.kind === "secret") {
        const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
        let asked = false;
        out._writeToOutput = (s: string) => {
          if (!asked) {
            asked = true;
            process.stdout.write(s);
          } else if (s.includes("\n")) process.stdout.write("\n");
        };
      }
      rl.question(`${q.question} `, (a) => {
        rl.close();
        resolve(a);
      });
    });
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const log = (l: string) => console.log(l);
  const r = await goLive({ opt, g: new RealGoogle(PKG, log), prompt: terminalPrompt(), log, state: loadState(), save: saveState, repoRoot: REPO });
  process.exitCode = r.stopped ? 1 : 0;
}

if (require.main === module)
  main().catch((e) => {
    console.error("");
    console.error(`go-live stopped: ${(e as Error).message}`);
    console.error("Everything finished before this is kept (.state.json). Fix the problem and run go-live again; it picks up where it left off.");
    process.exitCode = 1;
  });
