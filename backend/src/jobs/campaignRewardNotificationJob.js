import { log } from '../middleware/logger.js';

export function createCampaignRewardNotificationJob({ dal, emailService }) {
  return async function sendRewardNotifications() {
    try {
      if (!dal.campaigns || !emailService || !dal.campaignRewardNotifications) {
        log.warn('[campaignRewardNotif] Required services not available');
        return;
      }

      const campaigns = dal.campaigns.list({ limit: 1000 });
      let totalSent = 0;
      let totalSkipped = 0;

      for (const campaign of campaigns) {
        if (!campaign.active || !campaign.rewardPerAction || campaign.rewardPerAction <= 0) {
          continue;
        }

        try {
          const participantAddresses = await dal.campaigns.getParticipants(campaign.id);

          for (const address of participantAddresses) {
            if (dal.campaignRewardNotifications.hasBeenNotified(campaign.id, address)) {
              totalSkipped++;
              continue;
            }

            const userEmail = await dal.campaigns.getUserEmail(address);
            if (!userEmail) {
              continue;
            }

            try {
              await emailService.send({
                to: userEmail,
                template: 'claim-rewards-v1',
                data: {
                  name: address.slice(0, 6),
                  points: campaign.rewardPerAction,
                  claimUrl: `${process.env.APP_URL || 'https://app.trivela.com'}/campaigns/${campaign.id}/claim`,
                },
              });

              dal.campaignRewardNotifications.recordNotification(campaign.id, address);
              totalSent++;

              log.debug(
                { campaignId: campaign.id, address },
                '[campaignRewardNotif] Sent notification',
              );
            } catch (emailErr) {
              log.warn(
                { campaignId: campaign.id, address, err: emailErr },
                '[campaignRewardNotif] Failed to send email',
              );
            }
          }
        } catch (campaignErr) {
          log.error(
            { campaignId: campaign.id, err: campaignErr },
            '[campaignRewardNotif] Failed processing campaign',
          );
        }
      }

      log.info(
        { sent: totalSent, skipped: totalSkipped },
        '[campaignRewardNotif] Notification job completed',
      );
    } catch (error) {
      log.error({ err: error }, '[campaignRewardNotif] Job failed');
      throw error;
    }
  };
}
