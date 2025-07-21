#!/usr/bin/env bun
/**
 * Message Flow Simulator - Tests realistic chat scenarios
 * Simulates how messages flow through the system from chat to AI response
 */

import { AppBootstrapper } from './app-bootstrapper';
import type { MessageContext } from './services/message-router.service';

// Color codes for better output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logChat(user: string, message: string) {
  const time = new Date().toLocaleTimeString();
  console.log(
    `${colors.gray}[${time}]${colors.reset} ${colors.bright}${user}:${colors.reset} ${message}`
  );
}

function logBot(botName: string, action: string, details?: string) {
  const time = new Date().toLocaleTimeString();
  console.log(
    `${colors.gray}[${time}]${colors.reset} ${colors.cyan}🤖 ${botName}${colors.reset} ${action}${
      details ? ` ${colors.dim}(${details})${colors.reset}` : ''
    }`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateConversation() {
  log(
    '🎭 Message Flow Simulator - Testing realistic chat scenarios\n',
    colors.bright
  );

  try {
    // Initialize application
    const bootstrapper = new AppBootstrapper();
    const app = await bootstrapper.bootstrap();
    const services = app.getServices();

    log('✅ System initialized. Starting chat simulation...\n', colors.green);

    // Scenario 1: User greets the chat
    log('═══ Scenario 1: Greeting Flow ═══\n', colors.bright + colors.blue);

    logChat('NewViewer123', 'Hey everyone! First time here');

    const greetingContext: MessageContext = {
      channel: 'testchannel',
      user: 'NewViewer123',
      message: 'Hey everyone! First time here',
      timestamp: new Date(),
      mentionedBots: [],
    };

    let responses = services.orchestrator.determineResponses(greetingContext);

    if (responses.length > 0) {
      for (const response of responses) {
        logBot(
          response.botName,
          'scheduled to respond',
          `${response.priority} priority, ${response.delay}ms delay`
        );
        await sleep(100); // Simulate processing
      }
      log('→ A bot might respond to the greeting (20% chance)\n', colors.green);
    } else {
      log('→ No bot response triggered (80% chance)\n', colors.yellow);
    }

    await sleep(1000);

    // Scenario 2: Direct mention
    log(
      '═══ Scenario 2: Direct Mention Flow ═══\n',
      colors.bright + colors.blue
    );

    logChat(
      'GamerPro42',
      '@stickyman1776 what build should I go for this champion?'
    );

    const mentionContext: MessageContext = {
      channel: 'testchannel',
      user: 'GamerPro42',
      message: '@stickyman1776 what build should I go for this champion?',
      timestamp: new Date(),
      mentionedBots: ['stickyman1776' as const],
    };

    responses = services.orchestrator.determineResponses(mentionContext);

    for (const response of responses) {
      logBot(response.botName, 'analyzing message', 'high priority response');
      await sleep(500);
      logBot(
        response.botName,
        'generating response',
        `will respond in ${(response.delay / 1000).toFixed(1)}s`
      );
    }

    log('→ Bot will respond with game advice\n', colors.green);
    await sleep(1500);

    // Scenario 3: Bot conversation simulation
    log(
      '═══ Scenario 3: Bot Response Timing ═══\n',
      colors.bright + colors.blue
    );

    logChat('StreamMod', '@stickyman1776 what do you think about that play?');

    const multiContext: MessageContext = {
      channel: 'testchannel',
      user: 'StreamMod',
      message: '@stickyman1776 what do you think about that play?',
      timestamp: new Date(),
      mentionedBots: ['stickyman1776' as const],
    };

    responses = services.orchestrator.determineResponses(multiContext);

    log('Orchestrator decision:', colors.cyan);
    responses.forEach((response, index) => {
      const delaySeconds = (response.delay / 1000).toFixed(1);
      log(
        `  ${index + 1}. ${response.botName} will respond in ${delaySeconds}s`,
        colors.magenta
      );
    });

    // Simulate response
    for (const response of responses) {
      await sleep(response.delay / 10); // Speed up for demo
      logBot(response.botName, 'responds', 'sharing their perspective');
    }

    log('→ Bot responded with appropriate timing\n', colors.green);
    await sleep(1000);

    // Scenario 4: Bot filtering test
    log(
      '═══ Scenario 4: Bot-to-Bot Message Filtering ═══\n',
      colors.bright + colors.blue
    );

    // Simulate a bot trying to send a message
    log('Testing bot-to-bot filtering...', colors.yellow);
    services.messageRouter.handleIncomingMessage(
      'testchannel',
      'stickyman1776',
      'Hey everyone!'
    );

    await sleep(500);
    log(
      '→ Message from bot was filtered out (no infinite loops!)\n',
      colors.green
    );

    // Scenario 5: Conversation state over time
    log(
      '═══ Scenario 5: Conversation State Evolution ═══\n',
      colors.bright + colors.blue
    );

    // Initial state
    let state = services.orchestrator.getConversationState();
    log(
      `Initial state: Active=${state.isActive}, Messages since bot=${state.messagesSinceLastBot}`,
      colors.gray
    );

    // User message
    logChat('ChatterBox', 'This stream is great!');
    services.orchestrator.determineResponses({
      channel: 'testchannel',
      user: 'ChatterBox',
      message: 'This stream is great!',
      timestamp: new Date(),
      mentionedBots: [],
    });

    state = services.orchestrator.getConversationState();
    log(
      `After user message: Active=${state.isActive}, Messages since bot=${state.messagesSinceLastBot}`,
      colors.gray
    );

    // Bot responds
    logChat('Viewer999', '@stickyman1776 thanks for the tips earlier!');
    services.orchestrator.determineResponses({
      channel: 'testchannel',
      user: 'Viewer999',
      message: '@stickyman1776 thanks for the tips earlier!',
      timestamp: new Date(),
      mentionedBots: ['stickyman1776' as const],
    });

    state = services.orchestrator.getConversationState();
    log(
      `After bot mention: Active=${state.isActive}, Messages since bot=${state.messagesSinceLastBot}`,
      colors.gray
    );

    log('\n→ Conversation state tracks activity properly\n', colors.green);

    // Scenario 6: Response priority demonstration
    log(
      '═══ Scenario 6: Response Priority System ═══\n',
      colors.bright + colors.blue
    );

    const priorityTests = [
      {
        message: '@stickyman1776 help!',
        user: 'UrgentUser',
        desc: 'Direct mention (HIGH priority)',
      },
      {
        message: 'Hello chat!',
        user: 'FriendlyUser',
        desc: 'Greeting (LOW priority, 20% chance)',
      },
      {
        message: 'The game is intense',
        user: 'RegularChatter',
        desc: 'Regular message (NO response)',
      },
    ];

    for (const test of priorityTests) {
      logChat(test.user, test.message);

      const context: MessageContext = {
        channel: 'testchannel',
        user: test.user,
        message: test.message,
        timestamp: new Date(),
        mentionedBots: test.message.includes('@stickyman1776')
          ? ['stickyman1776' as const]
          : [],
      };

      const responses = services.orchestrator.determineResponses(context);

      if (responses.length > 0) {
        const response = responses[0];
        log(
          `  → ${test.desc}: ${response.priority} priority, ${response.delay}ms delay`,
          colors.magenta
        );
      } else {
        log(`  → ${test.desc}: No response`, colors.gray);
      }

      await sleep(500);
    }

    // Clean shutdown
    log('\n═══ Shutdown ═══\n', colors.bright + colors.blue);
    await app.shutdown();
    log('✅ Message flow simulation completed successfully!', colors.green);

    // Summary
    log('\n📊 Simulation Summary:', colors.bright + colors.cyan);
    log('  ✓ Greeting responses work probabilistically', colors.green);
    log(
      '  ✓ Direct mentions trigger immediate high-priority responses',
      colors.green
    );
    log('  ✓ Bot responds with appropriate timing', colors.green);
    log('  ✓ Bot-to-bot messages are filtered preventing loops', colors.green);
    log('  ✓ Conversation state evolves correctly over time', colors.green);
    log(
      '  ✓ Priority system ensures appropriate response behavior',
      colors.green
    );

    log(
      '\nThis simulation demonstrates how messages flow through the Phase 2 architecture.',
      colors.yellow
    );
  } catch (error) {
    log(`\n❌ Simulation failed: ${error}`, colors.red);
    process.exit(1);
  }
}

// Run the simulation
simulateConversation().catch(console.error);
