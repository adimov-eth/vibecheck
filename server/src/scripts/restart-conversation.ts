import { restartGptProcessing } from '../utils/queue-cleanup';
import { log } from '../utils/logger.utils';

async function main() {
  try {
    // Get conversation ID from command line
    const args = process.argv.slice(2);
    const conversationId = args[0];

    if (!conversationId || args.includes('--help')) {
      console.log(`
Usage: bun src/scripts/restart-conversation.ts <conversation-id>

Arguments:
  conversation-id    The ID of the conversation to restart GPT processing for

Options:
  --help             Show this help message
      `);
      process.exit(0);
    }

    // Restart GPT processing
    const success = await restartGptProcessing(conversationId);

    if (success) {
      log(
        `Successfully restarted GPT processing for conversation: ${conversationId}`
      );
      log('Make sure the GPT worker is running to process the job!');
    } else {
      log(
        `Failed to restart GPT processing for conversation: ${conversationId}`,
        'error'
      );
      process.exit(1);
    }

    // Close the process
    process.exit(0);
  } catch (error) {
    log(
      `Error restarting conversation: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    process.exit(1);
  }
}

// Run the script
main();
