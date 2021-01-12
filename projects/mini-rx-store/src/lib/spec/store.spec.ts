import { actions$, configureStore } from '../store';
import StoreCore from '../store-core';
import { Action, Reducer } from '../models';
import { createFeatureSelector, createSelector } from '../selector';
import { Observable, of } from 'rxjs';
import { ofType } from '../utils';
import { catchError, map, mergeMap, take } from 'rxjs/operators';
import { ReduxDevtoolsExtension } from '../extensions/redux-devtools.extension';
import { cold, hot } from 'jest-marbles';
import { FeatureStore } from '../feature-store';
import { counterInitialState, counterReducer, CounterState, store } from './_spec-helpers';
import { LoggerExtension } from '../extensions/logger.extension';

const asyncUser: Partial<UserState> = {
    firstName: 'Steven',
    lastName: 'Seagal',
    age: 30,
};

const updatedAsyncUser: Partial<UserState> = {
    firstName: 'Steven',
    lastName: 'Seagal',
    age: 31,
};

function fakeApiGet(): Observable<UserState> {
    return cold('---a', { a: asyncUser });
}

function fakeApiUpdate(): Observable<UserState> {
    return cold('-a', { a: updatedAsyncUser });
}

function fakeApiWithError(): Observable<UserState> {
    return cold('-#');
}

interface UserState {
    firstName: string;
    lastName: string;
    age: number;
    err: string;
}

const initialState: UserState = {
    firstName: 'Bruce',
    lastName: 'Willis',
    age: 30,
    err: undefined,
};

function reducer(state: UserState = initialState, action: Action): UserState {
    switch (action.type) {
        case 'updateUser':
        case 'loadUserSuccess':
        case 'saveUserSuccess':
            return {
                ...state,
                ...action.payload,
            };
        case 'resetUser':
            return initialState;
        case 'incAge':
            return {
                ...state,
                age: state.age + 1,
            };
        case 'error':
            return {
                ...state,
                err: action.payload,
            };
        default:
            return state;
    }
}

const getUserFeatureState = createFeatureSelector<UserState>('user');
const getFirstName = createSelector(getUserFeatureState, (user) => user.firstName);
const getAge = createSelector(getUserFeatureState, (user) => user.age);

const getCounterFeatureState = createFeatureSelector<CounterState>('counter');
const getCounter1 = createSelector(getCounterFeatureState, (state) => state.counter);
const getCounter2FeatureState = createFeatureSelector<CounterState>('counter2');
const getCounter2 = createSelector(getCounter2FeatureState, (state) => state.counter);

class CounterFeatureState extends FeatureStore<CounterState> {
    constructor() {
        super('counter3', counterInitialState);
    }

    increment() {
        this.setState((state) => ({ counter: state.counter + 1 }));
    }
}

const getCounter3FeatureState = createFeatureSelector<CounterState>('counter3');
const getCounter3 = createSelector(getCounter3FeatureState, (state) => state.counter);

describe('Store', () => {
    it('should initialize the store with an empty object', () => {
        const spy = jest.fn();
        store.select((state) => state).subscribe(spy);
        expect(spy).toHaveBeenCalledWith({});
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should initialize a Feature state with a root reducer (and a meta reducer)', () => {
        const callOrder = [];

        function rootMetaReducer1(reducer) {
            return (state, action) => {
                callOrder.push('meta1');
                return reducer(state, action);
            };
        }

        function rootMetaReducer2(reducer) {
            return (state, action) => {
                callOrder.push('meta2');
                return reducer(state, action);
            };
        }

        StoreCore.config({
            reducers: { user: reducer },
            metaReducers: [rootMetaReducer1, rootMetaReducer2],
        });

        const spy = jest.fn();
        store.select((state) => state).subscribe(spy);
        expect(spy).toHaveBeenCalledWith({
            user: initialState,
        });
        expect(spy).toHaveBeenCalledTimes(1);

        // Call meta reducers from left to right
        expect(callOrder).toEqual(['meta1', 'meta2']);
    });

    it('should throw when reusing feature name', () => {
        expect(() => store.feature<UserState>('user', reducer)).toThrowError();
    });

    it('should run the redux reducers when a new Feature state is added', () => {
        const reducerSpy = jest.fn();

        function someReducer() {
            reducerSpy();
        }

        store.feature('oneMoreFeature', someReducer);
        store.feature('oneMoreFeature2', (state) => state);
        expect(reducerSpy).toHaveBeenCalledTimes(2);
    });

    it('should update the Feature state', () => {
        const user = {
            firstName: 'Nicolas',
            lastName: 'Cage',
        };

        store.dispatch({
            type: 'updateUser',
            payload: user,
        });

        const spy = jest.fn();
        store.select(getFirstName).subscribe(spy);
        expect(spy).toHaveBeenCalledWith(user.firstName);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should update the Feature state #1', () => {
        const age$ = store.select(getAge);
        hot('-a-b').subscribe((value) => store.dispatch({ type: 'incAge' }));
        expect(age$).toBeObservable(hot('ab-c', { a: 30, b: 31, c: 32 }));
    });

    it('should update the Feature state #2', () => {
        const age$ = store.select(getAge);
        hot('(ab)').subscribe((value) => store.dispatch({ type: 'incAge' }));
        expect(age$).toBeObservable(hot('(abc)', { a: 32, b: 33, c: 34 }));
    });

    it('should return undefined if feature does not exist yet', () => {
        const featureSelector = createFeatureSelector('notExistingFeature');

        const spy = jest.fn();
        store.select(featureSelector).subscribe(spy);
        expect(spy).toHaveBeenCalledWith(undefined);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should create and execute an effect', () => {
        store.dispatch({ type: 'resetUser' });

        store.createEffect(
            actions$.pipe(
                ofType('loadUser'),
                mergeMap(() =>
                    fakeApiGet().pipe(
                        map((user) => ({
                            type: 'loadUserSuccess',
                            payload: user,
                        }))
                    )
                )
            )
        );

        store.dispatch({ type: 'loadUser' });

        // Lets be crazy and add another effect while the other effect is busy
        cold('-a').subscribe(() => {
            store.createEffect(
                actions$.pipe(
                    ofType('saveUser'),
                    mergeMap(() =>
                        fakeApiUpdate().pipe(
                            map((user) => ({
                                type: 'saveUserSuccess',
                                payload: user,
                            }))
                        )
                    )
                )
            );

            store.dispatch({ type: 'saveUser' });
        });

        expect(store.select(getUserFeatureState)).toBeObservable(
            hot('a-xb', { a: initialState, b: asyncUser, x: updatedAsyncUser })
        );
    });

    it('should create and execute an effect and handle side effect error', () => {
        store.dispatch({ type: 'resetUser' });

        store.createEffect(
            actions$.pipe(
                ofType('someAction'),
                mergeMap(() =>
                    fakeApiWithError().pipe(
                        map((user) => ({
                            type: 'whatever',
                        })),
                        catchError((err) => of({ type: 'error', payload: 'error' }))
                    )
                )
            )
        );

        store.dispatch({ type: 'someAction' });

        expect(store.select(getUserFeatureState)).toBeObservable(
            hot('ab', { a: initialState, b: { ...initialState, err: 'error' } })
        );
    });

    it('should log', () => {
        console.log = jest.fn();

        const user: UserState = {
            firstName: 'John',
            lastName: 'Travolta',
            age: 35,
            err: undefined,
        };

        const newState = {
            user,
        };

        store._addExtension(new LoggerExtension());

        store.dispatch({
            type: 'updateUser',
            payload: user,
        });

        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('ACTION'),
            expect.anything(),
            expect.stringContaining('Type'),
            expect.stringContaining('updateUser'),
            expect.stringContaining('Payload'),
            user,
            expect.stringContaining('State'),
            newState
        );
    });

    it('should add extension', () => {
        const spy = jest.spyOn(StoreCore, 'addExtension');
        store._addExtension(new ReduxDevtoolsExtension({}));
        expect(spy).toHaveBeenCalledTimes(1);
        expect(StoreCore['extensions'].length).toBe(2);
    });

    it('should call the reducer before running the effect', () => {
        const callOrder = [];
        const someReducer = (state = {}, action: Action) => {
            switch (action.type) {
                case 'someAction2':
                    callOrder.push('reducer');
                default:
                    return state;
            }
        };
        const onEffectStarted = (): Observable<Action> => {
            callOrder.push('effect');
            return of({ type: 'whatever' });
        };

        store.feature('someFeature', someReducer);

        store.createEffect(
            actions$.pipe(
                ofType('someAction2'),
                mergeMap(() => onEffectStarted())
            )
        );

        store.dispatch({ type: 'someAction2' });

        expect(callOrder).toEqual(['reducer', 'effect']);
    });

    it('should queue actions', () => {
        const callLimit = 5000;

        store.feature<CounterState>('counter', counterReducer);

        const spy = jest.fn().mockImplementation((value) => {
            store.dispatch({ type: 'counter' });
        });

        const counter1$ = store.select(getCounter1);

        counter1$.pipe(take(callLimit)).subscribe(spy);

        expect(spy).toHaveBeenCalledTimes(callLimit);
        expect(spy).toHaveBeenNthCalledWith(callLimit, callLimit);
    });

    it('should queue effect actions', () => {
        const callLimit = 5000;

        function counter2Reducer(state: CounterState = counterInitialState, action: Action) {
            switch (action.type) {
                case 'counterEffectSuccess':
                    return {
                        ...state,
                        counter: state.counter + 1,
                    };
                default:
                    return state;
            }
        }

        store.feature<CounterState>('counter2', counter2Reducer);

        store.createEffect(
            actions$.pipe(
                ofType('counterEffectStart'),
                mergeMap(() => of({ type: 'counterEffectSuccess' }))
            )
        );

        const spy2 = jest.fn().mockImplementation((value) => {
            store.dispatch({ type: 'counterEffectStart' });
        });

        const counter2$ = store.select(getCounter2);

        counter2$.pipe(take(callLimit)).subscribe(spy2);

        expect(spy2).toHaveBeenCalledTimes(callLimit);
        expect(spy2).toHaveBeenNthCalledWith(callLimit, callLimit);
    });

    it('should select state from a Feature (which was created with `extends Feature)', () => {
        const counterFeatureState = new CounterFeatureState();
        counterFeatureState.increment();

        const spy = jest.fn();
        store.select(getCounter3).subscribe(spy);
        expect(spy).toHaveBeenCalledWith(2);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should resubscribe on action stream when side effect error is not handled', () => {
        const spy = jest.fn();

        store.createEffect(
            actions$.pipe(
                ofType('someAction3'),
                mergeMap(() => {
                    spy();
                    throw new Error();
                })
            )
        );

        store.dispatch({ type: 'someAction3' });
        store.dispatch({ type: 'someAction3' });
        store.dispatch({ type: 'someAction3' });

        expect(spy).toHaveBeenCalledTimes(3);
    });

    it('should throw when creating store again with functional creation method', () => {
        expect(() => configureStore({})).toThrow();
    });
});

describe('Store Root MetaReducers and Feature Meta Reducers', () => {
    const nextStateSpy = jest.fn();

    function aFeatureReducer(state: string = 'a', action: Action): string {
        switch (action.type) {
            case 'metaTest':
                return state + 'e';
            default:
                return state;
        }
    }

    function rootMetaReducer1(reducer: Reducer<any>): Reducer<any> {
        return (state, action) => {
            if (action.type === 'metaTest') {
                state = {
                    ...state,
                    metaTestFeature: state.metaTestFeature + 'b',
                };
            }

            return reducer(state, action);
        };
    }

    function rootMetaReducer2(reducer: Reducer<any>): Reducer<any> {
        return (state, action) => {
            if (action.type === 'metaTest') {
                state = {
                    ...state,
                    metaTestFeature: state.metaTestFeature + 'c',
                };
            }

            return reducer(state, action);
        };
    }

    function inTheMiddleRootMetaReducer(reducer) {
        return (state, action) => {
            const nextState = reducer(state, action);

            nextStateSpy(nextState);

            return reducer(state, action);
        };
    }

    function featureMetaReducer(reducer: Reducer<string>): Reducer<string> {
        return (state, action) => {
            if (action.type === 'metaTest') {
                state = state + 'd';
            }

            return reducer(state, action);
        };
    }

    const getMetaTestFeature = createFeatureSelector<string>('metaTestFeature');

    beforeAll(() => {
        StoreCore.addMetaReducers(rootMetaReducer1);
        StoreCore.addMetaReducers(inTheMiddleRootMetaReducer);
        StoreCore.addMetaReducers(rootMetaReducer2);
        StoreCore.addFeature<string>('metaTestFeature', aFeatureReducer, {
            metaReducers: [featureMetaReducer],
        });
    });
    it('should run meta reducers in order: 1.) root meta reducers 2.) feature meta reducers, 3.) feature reducer', () => {
        const spy = jest.fn();
        StoreCore.select(getMetaTestFeature).subscribe(spy);
        StoreCore.dispatch({ type: 'metaTest' });
        expect(spy).toHaveBeenCalledWith('abcde');
    });
    it('should calculate nextState also if nextState is calculated by a metaReducer in the "middle"', () => {
        expect(nextStateSpy).toHaveBeenCalledWith(
            expect.objectContaining({ metaTestFeature: 'a' })
        );
        expect(nextStateSpy).toHaveBeenCalledWith(
            expect.objectContaining({ metaTestFeature: 'abcde' })
        );
    });
});

describe('Store Feature MetaReducers', () => {
    const getMetaTestFeature = createFeatureSelector<CounterStringState>('metaTestFeature2');
    const getCount = createSelector(getMetaTestFeature, (state) => state.count);

    interface CounterStringState {
        count: string;
    }

    function aFeatureReducer(
        state: CounterStringState = { count: '0' },
        action: Action
    ): CounterStringState {
        switch (action.type) {
            case 'metaTest2':
                return {
                    ...state,
                    count: state.count + '3',
                };
            default:
                return state;
        }
    }

    function featureMetaReducer1(reducer): Reducer<CounterStringState> {
        return (state, action: Action) => {
            if (action.type === 'metaTest2') {
                state = {
                    ...state,
                    count: state.count + '1',
                };
            }

            return reducer(state, action);
        };
    }

    function featureMetaReducer2(reducer): Reducer<CounterStringState> {
        return (state, action: Action) => {
            if (action.type === 'metaTest2') {
                state = {
                    ...state,
                    count: state.count + '2',
                };
            }

            return reducer(state, action);
        };
    }

    const nextStateSpy = jest.fn();

    function inTheMiddleMetaReducer(reducer) {
        return (state, action) => {
            const nextState = reducer(state, action);

            nextStateSpy(nextState);

            return reducer(state, action);
        };
    }

    it('should run meta reducers first, then the normal reducer', () => {
        StoreCore.addFeature<CounterStringState>('metaTestFeature2', aFeatureReducer, {
            metaReducers: [featureMetaReducer1, inTheMiddleMetaReducer, featureMetaReducer2],
        });

        const spy = jest.fn();
        StoreCore.select(getCount).subscribe(spy);
        StoreCore.dispatch({ type: 'metaTest2' });
        expect(spy).toHaveBeenCalledWith('0');
        expect(spy).toHaveBeenCalledWith('0123');
    });
    it('should calculate nextState also if nextState is calculated by a metaReducer in the "middle"', () => {
        expect(nextStateSpy).toHaveBeenCalledWith({ count: '0' });
        expect(nextStateSpy).toHaveBeenCalledWith({ count: '0123' });
        expect(nextStateSpy).toHaveBeenCalledTimes(4); // 4? Because inTheMiddleRootMetaReducer is calling `reducer` to calculate the nextstate
    });
});
