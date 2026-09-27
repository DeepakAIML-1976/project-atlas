import { Router, type IRouter } from "express";
import healthRouter from "./health";
import atlasRouter from "./atlas";
import atlasStorageRouter from "./atlas-storage";
import atlasAnalysisRouter from "./atlas-analysis";

const router: IRouter = Router();

router.use(healthRouter);
router.use(atlasRouter);
router.use(atlasStorageRouter);
router.use(atlasAnalysisRouter);

export default router;
