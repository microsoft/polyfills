function errorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  try {
    return String(error);
  } catch {
    return "Unknown error";
  }
}

function escapeAzureLoggingCommandData(value) {
  return value
    .replaceAll("%", "%AZP25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function reportReleaseScriptError(error, logError = console.error) {
  const message = errorMessage(error);
  logError(
    process.env.TF_BUILD
      ? `##vso[task.logissue type=error]${escapeAzureLoggingCommandData(message)}`
      : message,
  );
}

export {
  errorMessage,
  escapeAzureLoggingCommandData,
  reportReleaseScriptError,
};
