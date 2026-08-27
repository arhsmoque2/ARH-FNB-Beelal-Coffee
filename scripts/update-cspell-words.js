import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

async function readCspellConfig(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeCspellConfig(filePath, config) {
  await fs.writeFile(filePath, `${JSON.stringify(config, undefined, "\t")}\n`);
}

async function updateWordsInConfig(filePath, words) {
  const config = await readCspellConfig(filePath);
  config.words = words;
  await writeCspellConfig(filePath, config);
}

async function updateCspellWords() {
  const cspellPath = path.join(repoRoot, "cspell.json");
  const existing = await readCspellConfig(cspellPath);
  const initialWords = new Set(existing.words || []);

  try {
    const { stdout } = await execa(
      "npx",
      ["cspell", "--words-only", "--unique", "--no-progress", "**/*"],
      {
        cwd: repoRoot,
        reject: false,
        shell: true
      }
    );

    const newWords = stdout
      .trim()
      .split("\n")
      .map((w) => w.trim())
      .filter(Boolean);

    for (const w of newWords) {
      initialWords.add(w);
    }

    const sortedWords = Array.from(initialWords).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );

    await updateWordsInConfig(cspellPath, sortedWords);
    console.log(`✅ Updated cspell.json with ${sortedWords.length} words.`);
  } catch (err) {
    console.error("❌ Failed to update cspell dictionary:", err);
    process.exit(1);
  }
}

await updateCspellWords();
