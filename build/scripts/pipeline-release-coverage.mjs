function splitMappingEntry(text) {
  let quote = null;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if ((char === "'" || char === '"') && text[index - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char;
    } else if (char === ":" && quote === null) {
      return [text.slice(0, index).trim(), text.slice(index + 1).trim()];
    }
  }
  throw new Error(`Unsupported YAML entry: ${text}`);
}

function parseScalar(value) {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  return value;
}

function parsePipelineYaml(source) {
  const lines = source
    .split(/\r?\n/)
    .map((raw, lineNumber) => ({
      indent: raw.match(/^ */)[0].length,
      lineNumber: lineNumber + 1,
      text: raw.trim(),
      raw,
    }))
    .filter(line => line.text && !line.text.startsWith("#"));

  function parseBlock(start, indent) {
    return lines[start].text.startsWith("-")
      ? parseSequence(start, indent)
      : parseMapping(start, indent);
  }

  function parseValue(value, index, indent) {
    if (value === "|" || value === ">") {
      const content = [];
      let next = index + 1;
      while (next < lines.length && lines[next].indent > indent) {
        content.push(lines[next].raw.slice(indent + 2));
        next++;
      }
      return { next, value: content.join("\n") };
    }
    if (value) return { next: index + 1, value: parseScalar(value) };
    if (
      index + 1 < lines.length &&
      (lines[index + 1].indent > indent ||
        (lines[index + 1].indent === indent &&
          lines[index + 1].text.startsWith("-")))
    ) {
      return parseBlock(index + 1, lines[index + 1].indent);
    }
    return { next: index + 1, value: null };
  }

  function parseMapping(start, indent) {
    const mapping = {};
    let index = start;
    while (
      index < lines.length &&
      lines[index].indent === indent &&
      !lines[index].text.startsWith("-")
    ) {
      const [key, rawValue] = splitMappingEntry(lines[index].text);
      const parsed = parseValue(rawValue, index, indent);
      mapping[key] = parsed.value;
      index = parsed.next;
    }
    return { next: index, value: mapping };
  }

  function parseSequence(start, indent) {
    const sequence = [];
    let index = start;
    while (
      index < lines.length &&
      lines[index].indent === indent &&
      lines[index].text.startsWith("-")
    ) {
      const itemText = lines[index].text.slice(1).trim();
      if (!itemText) {
        const parsed = parseBlock(index + 1, lines[index + 1].indent);
        sequence.push(parsed.value);
        index = parsed.next;
        continue;
      }

      let entry;
      try {
        entry = splitMappingEntry(itemText);
      } catch {
        sequence.push(parseScalar(itemText));
        index++;
        continue;
      }
      const [key, rawValue] = entry;
      const item = {};
      const parsed = parseValue(rawValue, index, indent);
      item[key] = parsed.value;
      index = parsed.next;
      if (
        index < lines.length &&
        lines[index].indent > indent &&
        !lines[index].text.startsWith("-")
      ) {
        const remaining = parseMapping(index, lines[index].indent);
        Object.assign(item, remaining.value);
        index = remaining.next;
      }
      sequence.push(item);
    }
    return { next: index, value: sequence };
  }

  if (lines.length === 0) {
    throw new Error("Pipeline YAML is empty.");
  }
  return parseBlock(0, lines[0].indent).value;
}

function flattenStages(stages) {
  return stages.flatMap(stage => {
    if (stage?.stage) return [stage];
    return Object.values(stage ?? {}).flatMap(value =>
      Array.isArray(value) ? flattenStages(value) : [],
    );
  });
}

function validateStaticGitHubReleaseCoverage(workspaces, pipeline) {
  if (typeof pipeline === "string") {
    pipeline = parsePipelineYaml(pipeline);
  }
  const stages = flattenStages(pipeline?.extends?.parameters?.stages ?? []);
  const publishStage = stages.find(stage => stage.stage === "PublishRelease");
  if (!publishStage) {
    throw new Error("PublishRelease stage is missing.");
  }

  const expectedVariables = new Map();
  for (const workspace of workspaces) {
    for (const suffix of ["Included", "ReleaseTag", "ReleaseAsset"]) {
      const name = `${workspace.outputPrefix}${suffix}`;
      expectedVariables.set(
        name,
        `$[ stageDependencies.ValidateArtifacts.Validate.outputs['release.${name}'] ]`,
      );
    }
  }

  const actualVariables = new Map(
    Object.entries(publishStage.variables ?? {}).filter(([name]) =>
      /(Included|ReleaseTag|ReleaseAsset)$/.test(name),
    ),
  );
  for (const [name, value] of expectedVariables) {
    if (actualVariables.get(name) !== value) {
      throw new Error(`Static release variable ${name} is missing or invalid.`);
    }
  }
  for (const name of actualVariables.keys()) {
    if (!expectedVariables.has(name)) {
      throw new Error(`Unknown static release variable ${name}.`);
    }
  }

  const publishJob = publishStage.jobs?.find(job => job.job === "PublishGitHub");
  const tasks = (publishJob?.steps ?? []).filter(
    step => step.task === "GitHubRelease@1",
  );
  const tasksByPrefix = new Map();
  for (const task of tasks) {
    const match = /^\$\((.+)ReleaseTag\)$/.exec(task.inputs?.tag ?? "");
    if (!match || tasksByPrefix.has(match[1])) {
      throw new Error("Unknown or duplicate GitHubRelease@1 task coverage.");
    }
    tasksByPrefix.set(match[1], task);
  }

  for (const workspace of workspaces) {
    const prefix = workspace.outputPrefix;
    const task = tasksByPrefix.get(prefix);
    if (!task) {
      throw new Error(`GitHubRelease@1 coverage is missing for ${workspace.name}.`);
    }
    const expectedCondition = `and(succeeded(), eq(variables['${prefix}Included'], 'true'), eq(variables['releaseCheck.${prefix}GitHubReleaseExists'], 'false'))`;
    const expectedTag = `$(${prefix}ReleaseTag)`;
    const expectedAsset = `$(Pipeline.Workspace)/releaseBuild/npm_packages/$(${prefix}ReleaseAsset)`;
    if (
      task.condition !== expectedCondition ||
      task.inputs?.gitHubConnection !== "fast" ||
      task.inputs?.repositoryName !== "microsoft/polyfills" ||
      task.inputs?.action !== "create" ||
      task.inputs?.tagSource !== "userSpecifiedTag" ||
      task.inputs?.tag !== expectedTag ||
      task.inputs?.title !== expectedTag ||
      task.inputs?.assets?.trim() !== expectedAsset
    ) {
      throw new Error(`GitHubRelease@1 coverage is invalid for ${workspace.name}.`);
    }
  }

  for (const prefix of tasksByPrefix.keys()) {
    if (!workspaces.some(workspace => workspace.outputPrefix === prefix)) {
      throw new Error(`Unknown GitHubRelease@1 task coverage for ${prefix}.`);
    }
  }
}

export { parsePipelineYaml, validateStaticGitHubReleaseCoverage };
