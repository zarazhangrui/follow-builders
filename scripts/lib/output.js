export async function writeJsonOutput(value, stream = process.stdout) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  await new Promise((resolve, reject) => {
    stream.write(payload, error => {
      if (error) reject(error);
      else resolve();
    });
  });
}
