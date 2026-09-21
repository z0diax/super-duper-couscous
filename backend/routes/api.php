<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\StateController;

Route::get('/health', function () {
    return response()->json([
        'ok' => true,
        'service' => 'hrmdo-laravel-api',
    ]);
});

Route::middleware('web')->group(function () {
    Route::get('/auth.php', [AuthController::class, 'session']);
    Route::post('/auth.php', [AuthController::class, 'login']);
    Route::delete('/auth.php', [AuthController::class, 'logout']);
    Route::get('/state.php', [StateController::class, 'show']);
});
