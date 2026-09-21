<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        return User::create([
            'id' => 'user-1',
            'email' => 'jane@example.test',
            'password_hash' => Hash::make('secret-password'),
            'name' => 'Jane Doe',
            'role' => 'staff',
            'role_title' => 'Staff',
            'office' => 'Main',
            'division' => 'Records',
            'position' => 'Officer',
            'avatar_initials' => 'JD',
        ]);
    }

    public function test_session_lookup_returns_guest_shape_and_csrf_token(): void
    {
        $this->getJson('/api/auth.php')
            ->assertOk()
            ->assertJsonStructure(['user', 'csrfToken'])
            ->assertJson(['user' => null]);
    }

    public function test_login_and_logout_use_a_session_and_public_user_projection(): void
    {
        $this->user();
        $session = $this->getJson('/api/auth.php');
        $token = $session->json('csrfToken');

        $this->withHeader('X-CSRF-TOKEN', $token)
            ->postJson('/api/auth.php', [
                'identifier' => 'jane@example.test',
                'password' => 'secret-password',
            ])
            ->assertOk()
            ->assertJsonPath('user.email', 'jane@example.test')
            ->assertJsonMissingPath('user.password_hash');

        $this->getJson('/api/auth.php')->assertJsonPath('user.id', 'user-1');

        $this->withHeader('X-CSRF-TOKEN', $token)
            ->deleteJson('/api/auth.php')
            ->assertOk()
            ->assertJson(['ok' => true]);

        $this->getJson('/api/auth.php')->assertJson(['user' => null]);
    }

    public function test_invalid_credentials_and_invalid_input_have_compatible_statuses(): void
    {
        $this->user();
        $token = $this->getJson('/api/auth.php')->json('csrfToken');

        $this->withHeader('X-CSRF-TOKEN', $token)
            ->postJson('/api/auth.php', ['identifier' => 'jane@example.test', 'password' => 'wrong'])
            ->assertStatus(401)
            ->assertJson(['error' => 'Invalid email, username, or password.']);

        $this->withHeader('X-CSRF-TOKEN', $token)
            ->postJson('/api/auth.php', ['identifier' => '', 'password' => ''])
            ->assertStatus(422)
            ->assertJson(['error' => 'Email or username and password are required.']);
    }

    public function test_changed_password_invalidates_an_existing_session(): void
    {
        $user = $this->user();
        $token = $this->getJson('/api/auth.php')->json('csrfToken');
        $this->withHeader('X-CSRF-TOKEN', $token)->postJson('/api/auth.php', [
            'identifier' => $user->email,
            'password' => 'secret-password',
        ])->assertOk();

        $user->update(['password_hash' => Hash::make('new-password')]);

        $this->getJson('/api/auth.php')->assertJson(['user' => null]);
    }
}
