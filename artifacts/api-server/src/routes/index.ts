import { Router, type IRouter } from "express";
import healthRouter from "./health";
import atlasRouter from "./atlas";
import atlasStorageRouter from "./atlas-storage";
import atlasAnalysisRouter from "./atlas-analysis";
import integrationsRouter from "./integrations";
import preferencesRouter from "./preferences";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(atlasRouter);
router.use(atlasStorageRouter);
router.use(atlasAnalysisRouter);
router.use(integrationsRouter);
router.use(preferencesRouter);

export default router;
