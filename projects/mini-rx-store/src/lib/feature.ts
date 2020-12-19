import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Action, AppState } from './interfaces';
import StoreCore from './store-core';
import { createActionTypePrefix, nameUpdateAction } from './utils';
import { createFeatureSelector, createSelector, Selector } from './selector';
import { undo } from './undo.extension';

type SetStateFn<StateType> = (state: StateType) => Partial<StateType>;
type StateOrCallback<StateType> = Partial<StateType> | SetStateFn<StateType>;

export abstract class Feature<StateType> {
    private readonly actionTypePrefix: string; // E.g. @mini-rx/products
    private readonly actionTypeSetState: string; // E.g. @mini-rx/products/SET-STATE
    private readonly featureSelector: Selector<AppState, StateType>;

    protected state$: BehaviorSubject<StateType> = new BehaviorSubject(undefined);
    get state(): StateType {
        return this.state$.getValue();
    }

    protected constructor(featureName: string, initialState: StateType) {
        StoreCore.addFeature<StateType>(featureName, initialState);

        this.actionTypePrefix = createActionTypePrefix(featureName);

        // Create Default Action Type (needed for setState())
        this.actionTypeSetState = `${this.actionTypePrefix}/${nameUpdateAction}`;

        this.featureSelector = createFeatureSelector<StateType>(featureName);

        // Select Feature State and delegate to local BehaviorSubject
        StoreCore.select(this.featureSelector).subscribe(this.state$);
    }

    protected setState(stateOrCallback: StateOrCallback<StateType>, name?: string): Action {
        const action: Action = {
            type: name ? this.actionTypeSetState + '/' + name : this.actionTypeSetState,
            payload: typeof stateOrCallback === 'function' ? stateOrCallback(this.state) : stateOrCallback
        };

        StoreCore.dispatch(action);

        return action;
    }

    protected select<K>(mapFn: (state: StateType) => K, selectFromStore?: boolean): Observable<K>;
    protected select<K>(mapFn: (state: AppState) => K, selectFromStore?: boolean): Observable<K>;
    protected select<K, T extends (state: AppState | StateType) => K>(
        mapFn: T,
        selectFromStore: boolean = false
    ): Observable<K> {
        if (selectFromStore) {
            return StoreCore.select(mapFn);
        }

        const selector = createSelector(
            this.featureSelector,
            mapFn
        );

        return StoreCore.select(selector);
    }

    protected createEffect<PayLoadType = any>(
        effectFn: (payload: Observable<PayLoadType>) => Observable<any>
    ): (payload?: PayLoadType) => void {
        const subject: Subject<PayLoadType> = new Subject();

        subject.pipe(
            effectFn
        ).subscribe();

        return (payload?: PayLoadType) => {
            subject.next(payload);
        };
    }

    protected undo(action: Action) {
        StoreCore.dispatch(undo(action));
    }
}
