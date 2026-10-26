const path = require('node:path');
const { ESLint } = require('eslint');

const rootPath = path.resolve(__dirname, '../..');

async function main() {
  const eslint = new ESLint({
    cwd: rootPath,
    overrideConfigFile: path.join(rootPath, 'eslint.config.mjs'),
  });
  const results = await eslint.lintFiles(['Backend/**/*.js', 'Backend/**/*.cjs', 'js/**/*.js']);
  const formatter = await eslint.loadFormatter('stylish');
  const output = formatter.format(results);
  if (output) process.stdout.write(output);

  const errores = results.reduce((cantidad, resultado) => cantidad + resultado.errorCount, 0);
  const advertencias = results.reduce(
    (cantidad, resultado) => cantidad + resultado.warningCount,
    0,
  );
  process.stdout.write(`\n${errores} error(es), ${advertencias} advertencia(s)\n`);
  if (errores > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('No se pudo ejecutar ESLint:', error);
  process.exitCode = 1;
});
