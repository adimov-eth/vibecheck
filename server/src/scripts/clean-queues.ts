import { cleanQueues } from '../utils/queue-cleanup';
import { log } from '../utils/logger.utils';

async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const cleanAudio = !args.includes('--skip-audio');
    const cleanGpt = !args.includes('--skip-gpt');

    // If neither is specified or both are skipped, show usage
    if ((!cleanAudio && !cleanGpt) || args.includes('--help')) {
      console.log(`
Usage: bun src/scripts/clean-queues.ts [options]

Options:
  --skip-audio    Don't clean the audio processing queue
  --skip-gpt      Don't clean the GPT processing queue
  --help          Show this help message
      `);
      process.exit(0);
    }

    // Clean the queues
    const result = await cleanQueues(cleanAudio, cleanGpt);

    // Log the results
    log('Queue cleanup completed');
    log(`Removed ${result.audioJobs} jobs from audio queue`);
    log(`Removed ${result.gptJobs} jobs from GPT queue`);

    // Close the process
    process.exit(0);
  } catch (error) {
    log(
      `Error cleaning queues: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    process.exit(1);
  }
}

// Run the script
main();
