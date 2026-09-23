export type SolutionStage = {
    id: string;
    title: string;
};

export type LearningProblemDoc = {
    domainId: string;
    pid: string;
    enabled: boolean;
    objectives: string[];
    secondarySkills: string[];
    concepts: string[];
    stages: SolutionStage[];
    protectedStages: string[];
    commonMistakes: string[];
    maxHintLevel?: number;
    tutorEnabled?: boolean;
    assistantEnabled?: boolean;
    analysisEnabled?: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export type LearningScaffoldDoc = {
    domainId: string;
    pid: string;
    language: string;
    level: number;
    code: string;
    version: number;
};

export type LearningChoiceDoc = {
    uid: number;
    domainId: string;
    pid: string;
    /** 学生端 0=自己挑战 1=给点框架 2=陪我做；内部 level 映射见 policy */
    mode: 0 | 1 | 2;
    scaffoldLevel: number;
    language?: string;
    updatedAt: Date;
};

declare module 'hydrooj' {
    interface Collections {
        fish_learning_problem: LearningProblemDoc;
        fish_learning_scaffold: LearningScaffoldDoc;
        fish_learning_choice: LearningChoiceDoc;
    }
    interface SystemKeys {
        'fishoj.scaffold.api_key': string;
        'fishoj.scaffold.base_url': string;
        'fishoj.scaffold.model': string;
    }
}
