import { Injectable } from '@angular/core';
import { Feature } from 'mini-rx-store';
import { ProductService } from '../product.service';
import {
    catchError,
    map,
    mergeMap,
    startWith,
    withLatestFrom,
} from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { Product } from '../product';
import {
    getCurrentProduct,
    getError,
    getProductById,
    getProducts,
    getShowProductCode,
    initialState,
    ProductState,
} from './index';

@Injectable({
    providedIn: 'root',
})
export class ProductStateService extends Feature<ProductState> {
    // SELECT STATE with memoized selectors
    displayCode$: Observable<boolean> = this.select(getShowProductCode);
    selectedProduct$: Observable<Product> = this.select(getCurrentProduct);
    products$: Observable<Product[]> = this.select(getProducts);
    errorMessage$: Observable<string> = this.select(getError);
    productById$: Observable<Product> = this.select(getProductById(1));

    constructor(private productService: ProductService) {
        super('products', initialState);
    }

    // FEATURE EFFECTS (scoped to the current feature state)
    // The completed sideEffects update the feature state directly
    loadProducts = this.createEffect(
        (payload$) =>
            payload$.pipe(
                mergeMap(() =>
                    this.productService.getProducts().pipe(
                        map((products) => ({
                            products,
                            error: '',
                        })),
                        catchError((error) =>
                            of({
                                error,
                                products: [],
                            })
                        )
                    )
                )
            ),
        'load'
    );

    createProduct = this.createEffect<Product>(
        (payload$) =>
            payload$.pipe(
                mergeMap((product) =>
                    this.productService.createProduct(product).pipe(
                        map((newProduct) => (state) => {
                            return {
                                products: [...state.products, newProduct],
                                currentProductId: newProduct.id,
                                error: '',
                            };
                        }),
                        catchError((error) =>
                            of({
                                error,
                            })
                        )
                    )
                )
            ),
        'create'
    );

    updateProduct = this.createEffect<Product>(
        (payload$) =>
            payload$.pipe(
                mergeMap((product) => {
                    return this.productService.updateProduct(product).pipe(
                        map((updatedProduct) => (state) => {
                            const updatedProducts = state.products.map((item) =>
                                updatedProduct.id === item.id
                                    ? updatedProduct
                                    : item
                            );
                            return {
                                products: updatedProducts,
                                currentProductId: product.id,
                                error: '',
                            };
                        }),
                        catchError((error) =>
                            of({
                                error,
                            })
                        )
                    );
                })
            ),
        'update'
    );

    deleteProduct = this.createEffect<number>((payload$) =>
        payload$.pipe(
            withLatestFrom(this.state$),
            mergeMap(([productId, lastState]) => {
                return this.productService.deleteProduct(productId).pipe(
                    map(() => (state) => {
                        return {
                            products: state.products.filter(
                                (product) => product.id !== productId
                            ),
                            currentProductId: null,
                            error: '',
                        };
                    }),
                    catchError((err) =>
                        of({
                            products: lastState.products, // Restore State before Optimistic Update
                            error: err,
                        })
                    ),
                    // Optimistic Update
                    startWith((state) => {
                        return {
                            products: state.products.filter(
                                (product) => product.id !== productId
                            ),
                        };
                    })
                );
            })
        ), 'delete'
    );

    // UPDATE STATE
    setCurrentProduct(id: number) {
        this.setState((state) => {
            if (state.currentProductId === id) {
                return state;
            }
            return {
                currentProductId: id,
            };
        }, 'currProd');
    }

    clearCurrentProduct() {
        this.setState({ currentProductId: undefined }, 'clearCurrProd');
    }

    initializeCurrentProduct() {
        this.setState({ currentProductId: 0 }, 'initCurrProd');
    }

    showProductCode(showProductCode: boolean) {
        this.setState({ showProductCode }, 'showProductCode');
    }
}
