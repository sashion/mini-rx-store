import { Observable } from 'rxjs';

export const enum ExtensionSortOrder {
    DEFAULT = 0,
    // The Undo Extension Meta Reducer should be the last one to be executed before "normal" reducers (for performance)
    // Reason: The Undo Extension Meta Reducers may send many Actions through all following Reducers to undo an Action
    // Also, we want to prevent that the replay of Actions shows up e.g. in the LoggerExtension Meta Reducer
    UNDO_EXTENSION = 1,
}

export type AppState = Record<string, any>;

export abstract class StoreExtension {
    sortOrder: ExtensionSortOrder = ExtensionSortOrder.DEFAULT;

    abstract init(): void;
}

export interface Action {
    type: string;
    // Allows any extra properties to be defined in an action.
    [x: string]: any;
}

export interface ActionWithPayload extends Action {
    payload?: any;
}

export interface StoreConfig<T> {
    reducers: ReducerDictionary<T>;
    initialState: T;
    metaReducers: MetaReducer<AppState>[];
    extensions: StoreExtension[];
}

// Used for the Redux API: Store.feature / StoreModule.forFeature
export interface FeatureConfig<StateType> {
    initialState: StateType;
    metaReducers?: MetaReducer<StateType>[];
}

// Used for createFeatureStore, new FeatureStore
export interface FeatureStoreConfig {
    multi?: boolean;
}

export class Actions extends Observable<Action> {}

export type Reducer<StateType> = (state: StateType, action: Action) => StateType;

export type MetaReducer<StateType> = (reducer: Reducer<StateType>) => Reducer<StateType>;

export type ReducerDictionary<T> = {
    [p in keyof T]: Reducer<T[p]>;
};

export type StateOrCallback<StateType> =
    | Partial<StateType>
    | ((state: StateType) => Partial<StateType>);

export const EFFECT_METADATA_KEY = '@mini-rx/effectMetaData';

export interface EffectConfig {
    /**
     * Determines if the action emitted by the effect is dispatched to the store.
     * If false, effect does not need to return type `Observable<Action>`.
     */
    dispatch?: boolean;
}

export interface HasEffectMetadata {
    [EFFECT_METADATA_KEY]: EffectConfig;
}
