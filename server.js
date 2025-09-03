import { app, logger } from "./src/app.js";
const port = process.env.PORT || 3000;
app.listen(port, () => logger.info(`API listening on :${port}`));
