'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { AuthenticationError, ExchangeError, NotSupported, BadRequest } = require ('./base/errors');

//  ---------------------------------------------------------------------------

module.exports = class bitkub extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'bitkub',
            'name': 'Bitkub',
            'countries': 'TH',
            'rateLimit': 1000,
            'version': 'v1',
            'has': {
                'CORS': true,
                'cancelOrder': true,
                'createOrder': true,
                'fetchBalance': true,
                'fetchDepositAddress': true,
                'fetchOrder': true,
                'fetchOpenOrders': true,
                'fetchMarkets': true,
                'fetchMyTrades': true,
                'fetchOrders': true,
                'transfer': true,
            },
            'urls': {
                'logo': 'https://www.bitkub.com/static/images/logo-white.png',
                'api': 'https://api.bitkub.com/api/',
                'www': 'https://bitkub.com',
                'doc': 'https://github.com/bitkub/bitkub-official-api-docs/blob/master/restful-api.md',
            },
            'requiredCredentials': {
                'apiKey': true,
                'secret': true,
                'uid': false,
            },
            'api': {
                'public': {
                    'get': [
                        'market/symbols',
                    ],
                },
                'private': {
                    'post': [
                        'market/balances',
                        'market/place-bid',
                        'market/place-ask',
                        'market/place-bid/test',
                        'market/place-ask/test',
                        'market/place-ask-by-fiat',
                        'market/cancel-order',
                        'market/order-info',
                        'market/wstoken',
                        'crypto/addresses',
                        'crypto/withdraw',
                        'market/my-open-orders',
                        'market/my-order-history',
                        'crypto/withdraw',
                    ],
                },
            },
            'fees': {
                'trading': {
                    'tierBased': false,
                    'percentage': true,
                    'taker': 0.25 / 100,
                    'maker': 0.25 / 100,
                    'tiers': {
                    },
                },
                'funding': {
                    'tierBased': false,
                    'percentage': false,
                    'withdraw': {
                        'BTC': 0.0005,
                        'ETH': 0.005,
                    },
                    'deposit': {

                    },
                },
            },
        });
    }

    parseBalance (response) {
        const balances = response['result'];
        const result = { 'info': balances };
        const currencies = Object.keys (balances);
        for (let i = 0; i < currencies.length; i++) {
            const currency = currencies[i];
            const balance = result[currency];
            const code = this.safeCurrencyCode (currency);
            const account = this.account ();
            account['free'] = this.safeString (balance, 'available');
            account['used'] = this.safeString (balance, 'reserved');
            result[code] = account;
        }
        return this.safeBalance (result);
    }

    async fetchMarkets () {
        let markets = await this.publicGetMarketSymbols ();
        //
        // {"error":"0","result":[{"id":"1","info":"Thai Baht to Bitcoin","symbol":"THB_BTC"},{"id":"2","info":"Thai Baht to Ethereum","symbol":"THB_ETH"},{"id":"3","info":"Thai Baht to Wancoin","symbol":"THB_WAN"},{"id":"4","info":"Thai Baht to Cardano","symbol":"THB_ADA"}
        //
        markets = markets.result;
        const result = [];
        for (let i = 0; i < markets.length; i++) {
            const market = markets[i];
            const [ quote, base ] = market['symbol'].split ('_');
            const symbol = base + '/' + quote;
            const id = market['id'];
            result.push ({
                'id': id,
                'symbol': symbol,
                'base': base,
                'quote': quote,
                'baseId': base,
                'quoteId': quote,
                'info': market,
                'active': true,
            });
        }
        return result;
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        throw new Error ('Not implemented');
        await this.loadMarkets ();
        const orderbook = await this.publicGetOrderBookPair (this.extend ({
            'pair': this.marketId (symbol),
        }, params));
        const timestamp = parseInt (orderbook['timestamp']) * 1000;
        return this.parseOrderBook (orderbook, timestamp);
    }

    getMarketFromTrade (trade) {
        throw new Error ('Not implemented');
        trade = this.omit (trade, [
            'fee',
            'price',
            'datetime',
            'tid',
            'type',
            'order_id',
            'side',
        ]);
        const currencyIds = Object.keys (trade);
        const numCurrencyIds = currencyIds.length;
        if (numCurrencyIds > 2) throw new ExchangeError (this.id + ' getMarketFromTrade too many keys: ' + this.json (currencyIds) + ' in the trade: ' + this.json (trade));
        if (numCurrencyIds === 2) {
            let marketId = currencyIds[0] + currencyIds[1];
            if (marketId in this.markets_by_id) return this.markets_by_id[marketId];
            marketId = currencyIds[1] + currencyIds[0];
            if (marketId in this.markets_by_id) return this.markets_by_id[marketId];
        }
        return undefined;
    }

    getMarketFromTrades (trades) {
        throw new Error ('Not implemented');
        const tradesBySymbol = this.indexBy (trades, 'symbol');
        const symbols = Object.keys (tradesBySymbol);
        const numSymbols = symbols.length;
        if (numSymbols === 1) return this.markets[symbols[0]];
        return undefined;
    }

    marketId (symbol) {
        const parts = symbol.split ('/');
        return parts[1] + '_' + parts[0];
    }

    parseTrade (trade, market = undefined) {
        throw new Error ('Not implemented');
        let timestamp = undefined;
        let symbol = undefined;
        if ('date' in trade) {
            timestamp = parseInt (trade['date']) * 1000;
        } else if ('datetime' in trade) {
            timestamp = this.parse8601 (trade['datetime']);
        }
        // only if overrided externally
        let side = this.safeString (trade, 'side');
        const orderId = this.safeString (trade, 'order_id');
        if (typeof orderId === 'undefined') {
            if (typeof side === 'undefined') {
                side = this.safeInteger (trade, 'type');
                if (side === 0) side = 'buy';
                else side = 'sell';
            }
        }
        let price = this.safeFloat (trade, 'price');
        let amount = this.safeFloat (trade, 'amount');
        let id = this.safeString (trade, 'tid');
        id = this.safeString (trade, 'id', id);
        if (typeof market === 'undefined') {
            const keys = Object.keys (trade);
            for (let i = 0; i < keys.length; i++) {
                if (keys[i].indexOf ('_') >= 0) {
                    const marketId = keys[i].replace ('_', '');
                    if (marketId in this.markets_by_id) market = this.markets_by_id[marketId];
                }
            }
            // if the market is still not defined
            // try to deduce it from used keys
            if (typeof market === 'undefined') market = this.getMarketFromTrade (trade);
        }
        const feeCost = this.safeFloat (trade, 'fee');
        let feeCurrency = undefined;
        if (typeof market !== 'undefined') {
            price = this.safeFloat (trade, market['symbolId'], price);
            amount = this.safeFloat (trade, market['baseId'], amount);
            feeCurrency = market['quote'];
            symbol = market['symbol'];
        }
        let cost = undefined;
        if (typeof price !== 'undefined') if (typeof amount !== 'undefined') cost = price * amount;
        return {
            'id': id,
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'order': orderId,
            'type': undefined,
            'side': side,
            'price': price,
            'amount': amount,
            'cost': cost,
            'fee': {
                'cost': feeCost,
                'currency': feeCurrency,
            },
        };
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        throw new Error ('Not implemented');
        await this.loadMarkets ();
        const market = this.market (symbol);
        const response = await this.publicGetTransactionsPair (this.extend ({
            'pair': market['id'],
            'time': 'minute',
        }, params));
        return this.parseTrades (response, market, since, limit);
    }

    async fetchBalance (params = {}) {
        await this.loadMarkets ();
        // {
        //     "error": 0,
        //     "result": {
        //         "THB":  {
        //         "available": 188379.27,
        //         "reserved": 0
        //         },
        //         "BTC": {
        //         "available": 8.90397323,
        //         "reserved": 0
        //         },
        //         "ETH": {
        //         "available": 10.1,
        //         "reserved": 0
        //         }
        //     }
        // }
        const response = await this.privatePostMarketBalances ();
        return this.parseBalance (response);
    }

    withoutTrailingZeroes (number) {
        // TODO how will this work out in Python?
        return parseFloat (number.toString ());
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        let method = 'privatePostMarketPlace';
        if (side === 'buy') {
            method += 'Bid';
        } else {
            method += 'Ask';
        }
        const order = {
            'sym': this.marketId (symbol),
            'amt': this.withoutTrailingZeroes (amount),
            'typ': type,
        };
        if (type === 'market') {
            price = 0;
        } else {
            order['rat'] = this.withoutTrailingZeroes (price);
        }
        const isTest = this.safeValue (params, 'test');
        delete params['test'];
        if (isTest) {
            method += 'Test';
        }
        const response = await this[method] (this.extend (order, params));
        return {
            'info': response,
            'id': response['id'],
            'price': response['rat'],
        };
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        return await this.privatePostMarketCancelOrder ({ 'id': id });
    }

    parseOrderStatus (order) {
        if ((order['status'] === 'filled') || (order['remaining'] === 0)) return 'closed';
        return 'open';
    }

    async fetchOrderStatus (id, symbol = undefined, params = {}) {
        throw new Error ('Not implemented');
        await this.loadMarkets ();
        const response = await this.privatePostOrderStatus (this.extend ({ 'id': id }, params));
        return this.parseOrderStatus (response);
    }

    async fetchOrder (id, symbol = undefined, params = {}) {
        throw new Error ('Not implemented');
        await this.loadMarkets ();
        let market = undefined;
        if (typeof symbol !== 'undefined') market = this.market (symbol);
        const response = await this.privatePostOrderStatus (this.extend ({ 'id': id }, params));
        return this.parseOrder (response, market);
    }

    async fetchMyTrades (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        throw new Error ('Not implemented');
        await this.loadMarkets ();
        const request = {};
        let method = 'privatePostUserTransactions';
        let market = undefined;
        if (typeof symbol !== 'undefined') {
            market = this.market (symbol);
            request['pair'] = market['id'];
            method += 'Pair';
        }
        const response = await this[method] (this.extend (request, params));
        return this.parseTrades (response, market, since, limit);
    }

    parseOrder (order, market = undefined) {
        throw new Error ('Not implemented');
        const id = this.safeString (order, 'id');
        let timestamp = undefined;
        let iso8601 = undefined;
        let side = this.safeString (order, 'type');
        if (typeof side !== 'undefined') side = (side === '1') ? 'sell' : 'buy';
        const datetimeString = this.safeString (order, 'datetime');
        if (typeof datetimeString !== 'undefined') {
            timestamp = this.parse8601 (datetimeString);
            iso8601 = this.iso8601 (timestamp);
        }
        let symbol = undefined;
        if (typeof market === 'undefined') {
            if ('currency_pair' in order) {
                const marketId = order['currency_pair'];
                if (marketId in this.markets_by_id) market = this.markets_by_id[marketId];
            }
        }
        let amount = this.safeFloat (order, 'amount');
        let filled = 0.0;
        const trades = [];
        const transactions = this.safeValue (order, 'transactions');
        let feeCost = undefined;
        let cost = undefined;
        if (typeof transactions !== 'undefined') {
            if (Array.isArray (transactions)) {
                for (let i = 0; i < transactions.length; i++) {
                    const trade = this.parseTrade (this.extend ({
                        'order_id': id,
                        'side': side,
                    }, transactions[i]), market);
                    filled += trade['amount'];
                    if (typeof feeCost === 'undefined') feeCost = 0.0;
                    feeCost += trade['fee']['cost'];
                    if (typeof cost === 'undefined') cost = 0.0;
                    cost += trade['cost'];
                    trades.push (trade);
                }
            }
        }
        let status = this.safeString (order, 'status');
        if ((status === 'In Queue') || (status === 'Open')) status = 'open';
        else if (status === 'Finished') {
            status = 'closed';
            if (typeof amount === 'undefined') amount = filled;
        }
        let remaining = undefined;
        if (typeof amount !== 'undefined') remaining = amount - filled;
        let price = this.safeFloat (order, 'price');
        if (typeof market === 'undefined') market = this.getMarketFromTrades (trades);
        let feeCurrency = undefined;
        if (typeof market !== 'undefined') {
            symbol = market['symbol'];
            feeCurrency = market['quote'];
        }
        if (typeof cost === 'undefined') {
            if (typeof price !== 'undefined') cost = price * filled;
        } else if (typeof price === 'undefined') {
            if (filled > 0) price = cost / filled;
        }
        const fee = {
            'cost': feeCost,
            'currency': feeCurrency,
        };
        return {
            'id': id,
            'datetime': iso8601,
            'timestamp': timestamp,
            'status': status,
            'symbol': symbol,
            'type': undefined,
            'side': side,
            'price': price,
            'cost': cost,
            'amount': amount,
            'filled': filled,
            'remaining': remaining,
            'trades': trades,
            'fee': fee,
            'info': order,
        };
    }

    async fetchOpenOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        throw new Error ('Not implemented');
        let market = undefined;
        if (typeof symbol !== 'undefined') {
            await this.loadMarkets ();
            market = this.market (symbol);
        }
        const orders = await this.privatePostOpenOrdersAll ();
        return this.parseOrders (orders, market, since, limit);
    }

    getCurrencyName (code) {
        throw new Error ('Not implemented');
        if (code === 'BTC') return 'bitcoin';
        return code.toLowerCase ();
    }

    isFiat (code) {
        if (code === 'THB') return true;
        if (code === 'USD') return true;
        if (code === 'EUR') return true;
        return false;
    }

    async fetchDepositAddress (code, params = {}) {
        throw new Error ('Not implemented');
        if (this.isFiat (code)) throw new NotSupported (this.id + ' fiat fetchDepositAddress() for ' + code + ' is not implemented yet');
        const name = this.getCurrencyName (code);
        const v1 = (code === 'BTC');
        let method = v1 ? 'v1' : 'private'; // v1 or v2
        method += 'Post' + this.capitalize (name);
        method += v1 ? 'Deposit' : '';
        method += 'Address';
        const response = await this[method] (params);
        const address = v1 ? response : this.safeString (response, 'address');
        const tag = v1 ? undefined : this.safeString (response, 'destination_tag');
        this.checkAddress (address);
        return {
            'currency': code,
            'status': 'ok',
            'address': address,
            'tag': tag,
            'info': response,
        };
    }

    async withdraw (code, amount, address, tag = undefined, params = {}) {
        [ tag, params ] = this.handleWithdrawTagAndParams (tag, params);
        this.checkAddress (address);
        if (this.isFiat (code)) throw new NotSupported (this.id + ' fiat withdraw() for ' + code + ' is not implemented yet');
        const name = this.getCurrencyName (code);
        const request = {
            'cur': name,
            'amt': amount,
            'adr': address,
        };
        let query = params;
        if (code === 'XRP') {
            if (typeof tag !== 'undefined') {
                request['mem'] = tag;
                query = this.omit (params, 'mem');
            } else {
                throw new ExchangeError (this.id + ' withdraw() requires a destination_tag param for ' + code);
            }
        }
        const response = await this.privatePostCryptoWithdraw (this.extend (request, query));
        const id = this.safeString (response['response'], 'txn');
        return {
            'info': response,
            'id': id,
        };
    }

    nonce () {
        return this.milliseconds ();
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let url = this.urls['api'];
        url += this.implodeParams (path, params);
        const query = this.omit (params, this.extractParams (path));
        if (api === 'public') {
            if (Object.keys (query).length) url += '?' + this.urlencode (query);
        } else {
            this.checkRequiredCredentials ();
            const ts = this.seconds ();
            const nonce = this.nonce ();
            params['ts'] = ts;
            // params['non'] = nonce
            const auth = JSON.stringify (params);
            const signature = this.encode (this.hmac (this.encode (auth), this.encode (this.secret)));
            params['sig'] = signature;
            body = JSON.stringify (params);
            headers = {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-BTK-APIKEY': this.apiKey,
            };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    handleErrors (httpCode, reason, url, method, headers, body) {
        // Refer to https://github.com/bitkub/bitkub-official-api-docs/blob/master/restful-api.md#error-codes
        if (typeof body !== 'string') return; // fallback to default error handler
        if (body.length < 2) return; // fallback to default error handler
        if ((body[0] === '{') || (body[0] === '[')) {
            const response = JSON.parse (body);
            const status = this.safeInteger (response, 'error');
            if (status > 0) {
                if (status === 1 || (status >= 10 && status <= 15) || status === 22) {
                    throw new BadRequest (this.id + ' some parameters are invalid; status: ' + status);
                }
                if ((status >= 2 && status <= 9) || status === 25 || status === 45 || status === 46 || status === 52) {
                    throw new AuthenticationError (this.id + ' failed auth or permissions; status ' + status);
                }
                throw new ExchangeError (this.id + ' ' + this.json (response));
            }
        }
    }
};
