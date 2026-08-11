import { Router, type IRouter } from "express";
import healthRouter from "./health";
import signalsRouter from "./signals";
import leaderboardRouter from "./leaderboard";
import oracleRouter from "./oracle";
import autopilotRouter from "./autopilot";
import { createArcadeRouter } from "./arcade";
import paymentRouter from "./payment";

const router: IRouter = Router();

router.use(healthRouter);
router.use(signalsRouter);
router.use(leaderboardRouter);
router.use(oracleRouter);
router.use(autopilotRouter);
router.use(createArcadeRouter());
router.use(paymentRouter);

export default router;
