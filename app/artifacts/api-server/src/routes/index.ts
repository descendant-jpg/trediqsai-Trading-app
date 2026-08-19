import { Router, type IRouter } from "express";
import healthRouter from "./health";
import signalsRouter from "./signals";
import leaderboardRouter from "./leaderboard";
import oracleRouter from "./oracle";
import { createArcadeRouter } from "./arcade";
import paymentRouter from "./payment";
import multiTimeframeRouter from "./multiTimeframe";
import marketNewsRouter from "./marketNews";
import botsRouter from "./bots";
import broadcastSignalsRouter from "./broadcastSignals";
import notificationsRouter from "./notifications";
import autopilotRouter from "./autopilot";
import revenueCatRouter from "./revenuecat";
import mobileAdminRouter from "./mobileAdmin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(signalsRouter);
router.use(leaderboardRouter);
router.use(oracleRouter);
router.use(createArcadeRouter());
router.use(paymentRouter);
router.use(multiTimeframeRouter);
router.use(marketNewsRouter);
router.use(botsRouter);
router.use(broadcastSignalsRouter);
router.use(notificationsRouter);
router.use(autopilotRouter);
router.use(revenueCatRouter);
router.use(mobileAdminRouter);

export default router;
