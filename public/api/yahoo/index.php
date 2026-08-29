<?php
/**
 * Yahoo Finance reverse proxy — production replacement for the Vite dev proxy.
 *
 * In development:  Vite proxies /api/yahoo/* → query1.finance.yahoo.com
 * In production:   Apache (.htaccess) routes /api/yahoo/* here, and this
 *                  script fetches from Yahoo Finance server-side, bypassing
 *                  browser CORS restrictions.
 *
 * Routed by .htaccess rules:
 *   /api/yahoo/*  → query1.finance.yahoo.com
 *   /api/yahoo2/* → query2.finance.yahoo.com
 */

// ── CORS headers ──────────────────────────────────────────────────────────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Accept, Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Determine target Yahoo Finance host ───────────────────────────────────────
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$isQuery2   = strpos($requestUri, '/api/yahoo2/') !== false;
$yfHost     = $isQuery2 ? 'query2.finance.yahoo.com' : 'query1.finance.yahoo.com';

// ── Extract path and query string ─────────────────────────────────────────────
$uriPath  = parse_url($requestUri, PHP_URL_PATH) ?? '';
$prefix   = $isQuery2 ? '/api/yahoo2' : '/api/yahoo';
$yfPath   = substr($uriPath, strlen($prefix));       // e.g. /v7/finance/quote

if (empty($yfPath) || $yfPath === '/') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing path']);
    exit;
}

$queryString = $_SERVER['QUERY_STRING'] ?? '';
$targetUrl   = "https://{$yfHost}{$yfPath}" . ($queryString ? "?{$queryString}" : '');

// ── Basic allowlist: only permit known Yahoo Finance paths ────────────────────
if (!preg_match('#^/v[0-9]+/finance/#', $yfPath)) {
    http_response_code(403);
    echo json_encode(['error' => 'Path not permitted']);
    exit;
}

// ── Fetch from Yahoo Finance ──────────────────────────────────────────────────
$context = stream_context_create([
    'http' => [
        'method'        => 'GET',
        'header'        =>
            "Accept: application/json\r\n" .
            "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) " .
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36\r\n",
        'ignore_errors' => true,
        'timeout'       => 10,
    ],
    'ssl' => [
        'verify_peer'      => true,
        'verify_peer_name' => true,
    ],
]);

$response = @file_get_contents($targetUrl, false, $context);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Yahoo Finance request failed']);
    exit;
}

// Pass through the HTTP status code from Yahoo Finance
$statusLine = $http_response_header[0] ?? 'HTTP/1.1 200 OK';
preg_match('/HTTP\/\d\.\d (\d{3})/', $statusLine, $m);
http_response_code((int)($m[1] ?? 200));

echo $response;
