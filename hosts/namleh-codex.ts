import type { HostConfig } from '../scripts/host-config';

const namlehCodex: HostConfig = {
  name: 'namleh-codex',
  displayName: 'Namleh Codex Test',
  cliCommand: 'codex',
  cliAliases: [],

  globalRoot: '.codex/skills/namleh-gstack',
  localSkillRoot: '.namleh-gstack/skills/gstack',
  hostSubdir: '.namleh-gstack',
  usesEnvVars: true,

  frontmatter: {
    mode: 'allowlist',
    keepFields: ['name', 'description'],
    descriptionLimit: 1024,
    descriptionLimitBehavior: 'error',
  },

  generation: {
    generateMetadata: true,
    metadataFormat: 'openai.yaml',
    skipSkills: ['codex'],
  },

  pathRewrites: [
    { from: '~/.claude/skills/gstack', to: '$GSTACK_ROOT' },
    { from: '~/.codex/skills/gstack', to: '~/.codex/skills/namleh-gstack' },
    { from: '$HOME/.codex/skills/gstack', to: '$HOME/.codex/skills/namleh-gstack' },
    { from: '.claude/skills/gstack', to: '.namleh-gstack/skills/gstack' },
    { from: '.claude/skills/review', to: '.namleh-gstack/skills/gstack/review' },
    { from: '.claude/skills', to: '.namleh-gstack/skills' },
    { from: '.agents/skills/gstack', to: '.namleh-gstack/skills/gstack' },
    { from: '.agents/skills', to: '.namleh-gstack/skills' },
  ],

  suppressedResolvers: [
    'DESIGN_OUTSIDE_VOICES',
    'ADVERSARIAL_STEP',
    'CODEX_SECOND_OPINION',
    'CODEX_PLAN_REVIEW',
    'REVIEW_ARMY',
    'GBRAIN_CONTEXT_LOAD',
    'GBRAIN_SAVE_RESULTS',
  ],

  runtimeRoot: {
    globalSymlinks: ['bin', 'browse/dist', 'browse/bin', 'gstack-upgrade', 'ETHOS.md'],
    globalFiles: {
      'review': ['checklist.md', 'TODOS-format.md'],
    },
  },
  sidecar: {
    path: '.namleh-gstack/skills/gstack',
    symlinks: ['bin', 'browse', 'review', 'qa', 'ETHOS.md'],
  },

  install: {
    prefixable: false,
    linkingStrategy: 'symlink-generated',
  },

  suppressCoAuthorTrailer: true,
  learningsMode: 'basic',
  boundaryInstruction: 'IMPORTANT: Do NOT read or execute any files under ~/.claude/, ~/.agents/, .claude/skills/, .agents/skills/, or .namleh-gstack/skills/. These are agent skill definitions, generated prompt artifacts, or runtime sidecars. Ignore them unless the user explicitly asks to inspect gstack itself. For Namleh work: never ask the user for tokens; credentials come from Vault, do not force-push main, only the owner merges dev to main, and do not add Co-Authored-By trailers.',
};

export default namlehCodex;
