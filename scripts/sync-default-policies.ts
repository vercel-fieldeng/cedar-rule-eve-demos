import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const root = process.cwd();
  const directory = resolve(root, "policies");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".cedar")).sort();
  const entries = await Promise.all(
    files.map(async (file) => {
      const id = file.slice(0, -".cedar".length);
      const text = await readFile(resolve(directory, file), "utf8");
      return `  ${JSON.stringify(id)}: ${JSON.stringify(text)},`;
    }),
  );
  const output = `// Generated from policies/*.cedar. Run \`pnpm policies:sync\` after editing canonical policy files.\nexport const GENERATED_POLICY_TEXT: Readonly<Record<string, string>> = {\n${entries.join("\n")}\n};\n`;
  await writeFile(resolve(root, "lib/cedar/generated-defaults.ts"), output);
}

await main();
