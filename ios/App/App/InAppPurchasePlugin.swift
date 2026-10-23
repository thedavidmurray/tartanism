//
//  InAppPurchasePlugin.swift — T19 StoreKit 2 one-time IAP for Pro.
//
//  Native Capacitor plugin wrapping StoreKit 2 async API. Exposes:
//    - getProducts()         → fetch Pro product info
//    - purchase(options)     → purchase flow
//    - restorePurchases()    → AppStore.sync restore
//    - getProStatus()        → check if Pro (from UserDefaults + transaction entitlement)
//
//  On successful purchase:
//    1. Writes Pro flag to UserDefaults (key: tartanism_pro)
//    2. Fires "purchase-updated" event to JS with { pro: true }
//    3. checkProStatus() verifies against current entitlements on demand
//
//  The web side syncs via getProStatus() on startup and caches in localStorage.
//
import Foundation
import StoreKit
import Capacitor

@objc(InAppPurchasePlugin)
public class InAppPurchasePlugin: CAPPlugin {

    // MARK: - Constants

    static let proProductId = "com.edgeless.tartanism.pro"
    static let proUserDefaultsKey = "tartanism_pro"

    // MARK: - Lifecycle

    override public func load() {
        // Listen for transaction updates (subscription renewals, refunds, etc.)
        Task {
            for await update in Transaction.updates {
                await handleTransactionUpdate(update)
            }
        }

        // On cold start: check current entitlements and sync flag
        Task {
            let isPro = await checkCurrentEntitlements()
            let wasPro = UserDefaults.standard.bool(forKey: Self.proUserDefaultsKey)
            if isPro != wasPro {
                UserDefaults.standard.set(isPro, forKey: Self.proUserDefaultsKey)
                notifyListeners("purchase-updated", data: ["pro": isPro])
            }
        }
    }

    // MARK: - Plugin Methods

    /// Fetch available products (non-consumable Pro).
    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: [Self.proProductId])
                let productList = products.map { product -> [String: Any] in
                    [
                        "identifier": product.id,
                        "displayName": product.displayName,
                        "description": product.description,
                        "displayPrice": product.displayPrice,
                        "price": "\(product.price)",
                        "currencyCode": product.priceFormatStyle.currencyCode,
                    ]
                }
                call.resolve(["products": productList])
            } catch {
                call.reject("Failed to load products: \(error.localizedDescription)")
            }
        }
    }

    /// Purchase the Pro product.
    @objc func purchase(_ call: CAPPluginCall) {
        let productId = call.getString("productIdentifier") ?? Self.proProductId

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Product not found for identifier: \(productId)")
                    return
                }

                let result = try await product.purchase()

                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        UserDefaults.standard.set(true, forKey: Self.proUserDefaultsKey)
                        self.notifyListeners("purchase-updated", data: ["pro": true])
                        call.resolve([
                            "pro": true,
                            "transactionId": "\(transaction.id)",
                        ])
                    case .unverified(_, let error):
                        call.reject("Transaction unverified: \(error.localizedDescription)")
                    }
                case .userCancelled:
                    call.resolve(["cancelled": true])
                case .pending:
                    call.resolve(["pending": true])
                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    /// Restore purchases via AppStore.sync.
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                let isPro = await checkCurrentEntitlements()
                UserDefaults.standard.set(isPro, forKey: Self.proUserDefaultsKey)
                self.notifyListeners("purchase-updated", data: ["pro": isPro])
                call.resolve(["restored": isPro])
            } catch {
                call.reject("Restore failed: \(error.localizedDescription)")
            }
        }
    }

    /// Check current Pro status (reads UserDefaults cache).
    @objc func getProStatus(_ call: CAPPluginCall) {
        // Also verify against current entitlements in the background
        Task {
            let entitlementPro = await checkCurrentEntitlements()
            let cachedPro = UserDefaults.standard.bool(forKey: Self.proUserDefaultsKey)
            let isPro = entitlementPro || cachedPro
            if isPro != cachedPro {
                UserDefaults.standard.set(isPro, forKey: Self.proUserDefaultsKey)
            }
            call.resolve(["pro": isPro])
        }
    }

    // MARK: - Helpers

    private func handleTransactionUpdate(_ update: VerificationResult<Transaction>) async {
        switch update {
        case .verified(let transaction):
            if transaction.productID == Self.proProductId {
                let isPro = transaction.revocationDate == nil
                UserDefaults.standard.set(isPro, forKey: Self.proUserDefaultsKey)
                notifyListeners("purchase-updated", data: ["pro": isPro])
                await transaction.finish()
            } else {
                await transaction.finish()
            }
        case .unverified:
            break
        }
    }

    private func checkCurrentEntitlements() async -> Bool {
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result,
               transaction.productID == Self.proProductId,
               transaction.revocationDate == nil {
                return true
            }
        }
        return false
    }
}
