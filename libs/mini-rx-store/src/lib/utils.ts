import { Observable, OperatorFunction, pipe } from 'rxjs';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import {
    Action,
    ActionWithPayload,
    AppState,
    EFFECT_METADATA_KEY,
    HasEffectMetadata,
} from './models';
import { isSetStateAction, SetStateAction } from './actions';
import { miniRxNameSpace } from './constants';

export function ofType(...allowedTypes: string[]): OperatorFunction<Action, Action> {
    return filter((action: Action) =>
        allowedTypes.some((type) => {
            return type === action.type;
        })
    );
}
export function select<T, R>(mapFn: (state: T) => R) {
    return pipe(map(mapFn), distinctUntilChanged());
}

export function miniRxError(message: string): never {
    throw new Error(miniRxNameSpace + ': ' + message);
}

export function miniRxConsoleError(message: string, err: any): void {
    console.error(miniRxNameSpace + ': ' + message + '\nDetails:', err);
}

/** @internal */
export function hasEffectMetaData(
    param: Observable<Action>
): param is Observable<Action> & HasEffectMetadata {
    return param.hasOwnProperty(EFFECT_METADATA_KEY);
}

// Simple alpha numeric ID: https://stackoverflow.com/a/12502559/453959
// This isn't a real GUID!
export function generateId() {
    return Math.random().toString(36).slice(2);
}

export function beautifyActionForLogging(action: Action, state: AppState): Action {
    if (isSetStateAction(action)) {
        return mapSetStateActionToActionWithPayload(action, state);
    }
    return action;
}

function mapSetStateActionToActionWithPayload(
    action: SetStateAction<any>,
    state: AppState
): ActionWithPayload {
    const stateOrCallback = action.stateOrCallback;
    const featureState = state[action.featureKey];
    return {
        type: action.type,
        payload:
            typeof stateOrCallback === 'function' ? stateOrCallback(featureState) : stateOrCallback,
    };
}
