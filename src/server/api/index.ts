// Side-effect imports — each module registers its routes on import.
// export.js MUST come before tasks.js so /tasks/export matches before /tasks/:id
import './config.js';
import './export.js';
import './bulk.js';
import './tasks.js';
import './notes.js';
import './feedback.js';
import './auth.js';
import './attachments.js';
import './ai-assist.js';
import './ai-agent.js';
