const OPTION_KEYS = ["a", "b", "c", "d"] as const;
type OptionKey = (typeof OPTION_KEYS)[number];

export type MultipleChoiceRowExercise = Readonly<{
  type: "multiple_choice";
  topic: string;
  difficulty: number;
  content: Readonly<{
    stem: string;
    options: readonly Readonly<{ id: OptionKey; text: string }>[];
  }>;
  answer_key: Readonly<{ correct_option_id: OptionKey }>;
  explanation: string | null;
}>;

export type CsvToExercisesResult = Readonly<{
  exercises: readonly MultipleChoiceRowExercise[];
  /** One entry per row that could not be converted, 1-indexed against the pasted text (header = row 1). */
  errors: readonly string[];
}>;

const REQUIRED_HEADERS = [
  "topic",
  "stem",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct",
] as const;

/** Splits on the first tab found anywhere in the text, otherwise falls back to comma — matches what a paste from Sheets/Excel (tab) vs. a saved .csv (comma) actually looks like. */
function detectDelimiter(text: string): "\t" | "," {
  return text.includes("\t") ? "\t" : ",";
}

function splitLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => cell.trim());
}

export function csvToMultipleChoiceExercises(raw: string): CsvToExercisesResult {
  const lines = raw
    .split(/\r\n|\r|\n/)
    .map((line) => line)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { exercises: [], errors: ["Yapıştırılan tablo boş."] };
  }

  const delimiter = detectDelimiter(lines[0]!);
  const header = splitLine(lines[0]!, delimiter).map((cell) =>
    cell.toLowerCase(),
  );

  const missingHeaders = REQUIRED_HEADERS.filter(
    (name) => !header.includes(name),
  );
  if (missingHeaders.length > 0) {
    return {
      exercises: [],
      errors: [
        `Eksik sütun başlığı: ${missingHeaders.join(", ")}. Beklenen sütunlar: ${REQUIRED_HEADERS.join(", ")} (opsiyonel: difficulty, explanation).`,
      ],
    };
  }

  const columnIndex = new Map(header.map((name, index) => [name, index]));
  const exercises: MultipleChoiceRowExercise[] = [];
  const errors: string[] = [];

  for (const [offset, line] of lines.slice(1).entries()) {
    const rowNumber = offset + 2; // 1-indexed, header is row 1
    const cells = splitLine(line, delimiter);
    const get = (name: string): string =>
      cells[columnIndex.get(name) ?? -1]?.trim() ?? "";

    const topic = get("topic");
    const stem = get("stem");
    const optionTexts: Record<OptionKey, string> = {
      a: get("option_a"),
      b: get("option_b"),
      c: get("option_c"),
      d: get("option_d"),
    };
    const correctRaw = get("correct").toLowerCase();
    const difficultyRaw = get("difficulty");
    const explanationRaw = get("explanation");

    const rowErrors: string[] = [];
    if (topic === "") rowErrors.push("konu boş");
    if (stem === "") rowErrors.push("soru kökü boş");
    for (const key of OPTION_KEYS) {
      if (optionTexts[key] === "") rowErrors.push(`${key} şıkkı boş`);
    }
    if (!OPTION_KEYS.includes(correctRaw as OptionKey)) {
      rowErrors.push(`doğru cevap 'a'-'d' olmalı, '${get("correct")}' değil`);
    }

    let difficulty = 3;
    if (difficultyRaw !== "") {
      const parsedDifficulty = Number(difficultyRaw);
      if (
        !Number.isInteger(parsedDifficulty) ||
        parsedDifficulty < 1 ||
        parsedDifficulty > 5
      ) {
        rowErrors.push("zorluk 1-5 arası bir tam sayı olmalı");
      } else {
        difficulty = parsedDifficulty;
      }
    }

    if (rowErrors.length > 0) {
      errors.push(`Satır ${rowNumber}: ${rowErrors.join(", ")}.`);
      continue;
    }

    exercises.push({
      type: "multiple_choice",
      topic,
      difficulty,
      content: {
        stem,
        options: OPTION_KEYS.map((key) => ({ id: key, text: optionTexts[key] })),
      },
      answer_key: { correct_option_id: correctRaw as OptionKey },
      explanation: explanationRaw === "" ? null : explanationRaw,
    });
  }

  return { exercises, errors };
}
