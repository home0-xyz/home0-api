import type { Env } from './shared/types/env';
import { DailyPropertyMonitor } from './cron/daily-monitor';

export default {
    async scheduled(
        controller: ScheduledController,
        env: Env,
        ctx: ExecutionContext
    ): Promise<void> {
        console.log('Cron job triggered at', new Date().toISOString());

        // Daily property monitoring
        if (controller.cron === '0 8 * * *') { // 8 AM UTC daily
            console.log('Running daily property monitoring...');
            
            const monitor = new DailyPropertyMonitor(env);
            
            try {
                const result = await monitor.runDailyMonitoring();
                console.log('Daily monitoring completed:', result);
                
                // Optional: Send notification about changes
                if (result.newListings > 0 || result.priceChanges > 0) {
                    // TODO: Implement notification system (email, webhook, etc.)
                    console.log(`Found ${result.newListings} new listings and ${result.priceChanges} price changes`);
                }
            } catch (error) {
                console.error('Daily monitoring failed:', error);
            }
        }
    }
};