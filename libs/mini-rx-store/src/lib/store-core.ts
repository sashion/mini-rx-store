import { BehaviorSubject, Observable, queueScheduler, Subject } from 'rxjs';
import { observeOn } from 'rxjs/operators';
import {
    Action,
    Actions,
    AppState,
    MetaReducer,
    Reducer,
    ReducerDictionary,
    StoreConfig,
    StoreExtension,
} from './models';
import { combineMetaReducers, createMiniRxAction, miniRxError, omit, select } from './utils';
import { defaultEffectsErrorHandler } from './default-effects-error-handler';
import { combineReducers } from './combine-reducers';

class StoreCore {
    // ACTIONS
    private actionsSource: Subject<Action> = new Subject();
    actions$: Actions = this.actionsSource.asObservable();

    // APP STATE
    private stateSource: BehaviorSubject<AppState> = new BehaviorSubject({}); // Init App State with empty object
    state$: Observable<AppState> = this.stateSource.asObservable();

    // META REDUCERS
    private metaReducersSource: BehaviorSubject<MetaReducer<AppState>[]> = new BehaviorSubject<
        MetaReducer<AppState>[]
    >([]);

    // FEATURE REDUCERS DICTIONARY
    private reducersSource: BehaviorSubject<ReducerDictionary<AppState>> = new BehaviorSubject({});
    private get reducers(): ReducerDictionary<AppState> {
        return this.reducersSource.getValue();
    }

    // EXTENSIONS
    private extensions: StoreExtension[] = [];

    constructor() {
        let combinedMetaReducer: MetaReducer<AppState>;
        let combinedReducer: Reducer<AppState>;
        // 👇 Refactored `withLatestFrom` in actions$.pipe to own subscriptions (fewer operators = less bundle-size :))
        this.metaReducersSource.subscribe((v) => (combinedMetaReducer = combineMetaReducers(v)));
        this.reducersSource.subscribe((v) => (combinedReducer = combineReducers(v)));

        // Listen to the Actions Stream and update state accordingly
        this.actions$
            .pipe(
                observeOn(queueScheduler) // Prevent stack overflow: https://blog.cloudboost.io/so-how-does-rx-js-queuescheduler-actually-work-188c1b46526e
            )
            .subscribe((action) => {
                const reducer: Reducer<AppState> = combinedMetaReducer(combinedReducer);
                const newState: AppState = reducer(this.stateSource.getValue(), action);
                this.updateState(newState);
            });
    }

    addMetaReducers(...reducers: MetaReducer<AppState>[]) {
        this.metaReducersSource.next([...this.metaReducersSource.getValue(), ...reducers]);
    }

    addFeature<StateType>(
        featureKey: string,
        reducer: Reducer<StateType>,
        config: {
            metaReducers?: MetaReducer<StateType>[];
            initialState?: StateType;
        } = {}
    ) {
        reducer = config.metaReducers?.length
            ? combineMetaReducers<StateType>(config.metaReducers)(reducer)
            : reducer;

        checkFeatureExists(featureKey, this.reducers);

        if (typeof config.initialState !== 'undefined') {
            reducer = createReducerWithInitialState(reducer, config.initialState);
        }

        this.addReducer(featureKey, reducer);
        this.dispatch(createMiniRxAction('init-feature', featureKey));
    }

    removeFeature(featureKey: string) {
        this.removeReducer(featureKey);
        this.dispatch(createMiniRxAction('destroy-feature', featureKey, featureKey));
    }

    config(config: Partial<StoreConfig<AppState>> = {}) {
        if (Object.keys(this.reducers).length) {
            miniRxError(
                '`configureStore` detected reducers. Did you instantiate FeatureStores before calling `configureStore`?'
            );
        }

        if (config.metaReducers?.length) {
            this.addMetaReducers(...config.metaReducers);
        }

        if (config.extensions?.length) {
            const sortedExtensions: StoreExtension[] = sortExtensions(config.extensions);
            sortedExtensions.forEach((extension) => this.addExtension(extension));
        }

        if (config.reducers) {
            Object.keys(config.reducers).forEach((featureKey) => {
                checkFeatureExists(featureKey, this.reducers);
                this.addReducer(featureKey, config.reducers![featureKey]); // config.reducers! (prevent TS2532: Object is possibly 'undefined')
            });
        }

        if (config.initialState) {
            this.updateState(config.initialState);
        }

        this.dispatch(createMiniRxAction('init-store'));
    }

    effect(effect$: Observable<Action>) {
        const effectWithErrorHandler$: Observable<Action> = defaultEffectsErrorHandler(effect$);
        effectWithErrorHandler$.subscribe((action) => this.dispatch(action));
    }

    dispatch(action: Action) {
        this.actionsSource.next(action);
    }

    updateState(state: AppState) {
        this.stateSource.next(state);
    }

    select<R>(mapFn: (state: AppState) => R): Observable<R> {
        return this.state$.pipe(select(mapFn));
    }

    addExtension(extension: StoreExtension) {
        extension.init();
        this.extensions.push(extension);
    }

    private addReducer(featureKey: string, reducer: Reducer<any>) {
        this.reducersSource.next({
            ...this.reducers,
            [featureKey]: reducer,
        });
    }

    private removeReducer(featureKey: string) {
        const reducers = omit(this.reducers, featureKey);
        this.reducersSource.next(reducers as ReducerDictionary<AppState>);
    }
}

function createReducerWithInitialState<StateType>(
    reducer: Reducer<StateType>,
    initialState: StateType
): Reducer<StateType> {
    return (state: StateType = initialState, action: Action): StateType => {
        return reducer(state, action);
    };
}

function checkFeatureExists(featureKey: string, reducers: ReducerDictionary<AppState>) {
    if (reducers.hasOwnProperty(featureKey)) {
        miniRxError(`Feature "${featureKey}" already exists.`);
    }
}

function sortExtensions(extensions: StoreExtension[]): StoreExtension[] {
    return [...extensions].sort((a, b) => {
        return a.sortOrder - b.sortOrder;
    });
}

// Created once to initialize singleton
export default new StoreCore();
