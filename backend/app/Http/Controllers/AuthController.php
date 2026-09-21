<?php

namespace App\Http\Controllers;

use App\Services\AuthenticationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Validator;

class AuthController extends Controller
{
    public function __construct(private readonly AuthenticationService $authentication)
    {
    }

    public function session(): JsonResponse
    {
        $user = $this->authentication->currentUser();

        return response()->json([
            'user' => $user?->publicProfile(),
            'csrfToken' => csrf_token(),
        ]);
    }

    public function login(Request $request): JsonResponse
    {
        $input = $request->all();
        $input['identifier'] = $input['identifier'] ?? $input['email'] ?? null;
        $validator = Validator::make($input, [
            'identifier' => ['required', 'string', 'max:190'],
            'password' => ['required', 'string', 'max:72'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Email or username and password are required.'], 422);
        }
        $validated = $validator->validated();
        $accountKey = 'auth:account:'.strtolower($validated['identifier']);
        $ipKey = 'auth:ip:'.$request->ip();
        if (RateLimiter::tooManyAttempts($accountKey, 20) || RateLimiter::tooManyAttempts($ipKey, 20)) {
            return response()->json([
                'error' => 'Too many sign-in attempts. Try again in 15 minutes.',
            ], 429);
        }

        $user = $this->authentication->authenticate($validated['identifier'], $validated['password']);
        if (! $user) {
            RateLimiter::hit($accountKey, 900);
            RateLimiter::hit($ipKey, 900);
            return response()->json(['error' => 'Invalid email, username, or password.'], 401);
        }

        RateLimiter::clear($accountKey);
        RateLimiter::clear($ipKey);
        auth()->login($user);
        $request->session()->regenerate();
        $request->session()->put('credential', hash('sha256', $user->password_hash));

        return response()->json([
            'user' => $user->publicProfile(),
            'csrfToken' => csrf_token(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        auth()->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }
}
