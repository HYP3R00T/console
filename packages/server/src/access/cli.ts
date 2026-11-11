import { homedir } from "node:os";
import { join } from "node:path";
import { AccessService } from "./service.ts";

const service = new AccessService(
  join(homedir(), ".local", "share", "console", "access.sqlite"),
);
try {
  const [command, id] = process.argv.slice(2);
  if (command === "invite")
    process.stdout.write(`${JSON.stringify(service.invite())}\n`);
  else if (command === "list")
    process.stdout.write(`${JSON.stringify(service.list(), null, 2)}\n`);
  else if (command === "revoke" && id) service.revoke(id);
  else throw new Error("Use invite, list or revoke <client-id>.");
} finally {
  service.close();
}
